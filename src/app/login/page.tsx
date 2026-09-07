import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/app") ? params.next : "/app";

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) redirect(nextPath);
    } catch {
      /* show login form */
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% -10%, rgba(255,196,140,0.08), transparent 55%)",
        }}
      />
      <header className="relative z-10 px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          hango
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text">
          Welcome back
        </h1>
        <p className="mb-8 text-sm text-text-secondary">
          Log in to{" "}
          <span className="text-text">hango</span>
          <span className="text-text-secondary">ut with your people.</span>
        </p>
        <AuthForm mode="login" nextPath={nextPath} />
      </main>
    </div>
  );
}
