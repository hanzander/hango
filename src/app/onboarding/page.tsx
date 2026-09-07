import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/app/demo");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/onboarding");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_complete")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_complete) redirect("/app");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          hango
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text">
          Create your profile
        </h1>
        <p className="mb-8 max-w-sm text-center text-sm text-text-secondary">
          Pick a username and how you appear to others. You can change this later.
        </p>
        <OnboardingForm
          initialDisplayName={
            profile?.display_name ||
            user.user_metadata?.display_name ||
            user.email?.split("@")[0] ||
            ""
          }
        />
      </main>
    </div>
  );
}
