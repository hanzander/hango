import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils";

export default async function SignupPage() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) redirect("/app");
    } catch {
      /* show signup form */
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          hango
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text">
          Create your account
        </h1>
        <p className="mb-8 text-sm text-text-secondary">
          You’ll pick a username and photo next.
        </p>
        <AuthForm mode="signup" />
      </main>
    </div>
  );
}
