import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isDemo = path === "/app/demo" || path.startsWith("/app/demo/");
  const isApp = path.startsWith("/app") && !isDemo;
  const isAuth =
    path === "/login" ||
    path === "/signup" ||
    path === "/forgot-password";
  const isResetPassword = path === "/reset-password";
  const isOnboarding = path === "/onboarding";

  if ((isApp || isOnboarding) && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (isApp || isOnboarding || isAuth) && !isResetPassword) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    const complete = Boolean(profile?.onboarding_complete);

    if (!complete && !isOnboarding && !isAuth) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/onboarding";
      return NextResponse.redirect(redirectUrl);
    }

    if (complete && isOnboarding) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/app";
      return NextResponse.redirect(redirectUrl);
    }

    if (isAuth) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = complete ? "/app" : "/onboarding";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
