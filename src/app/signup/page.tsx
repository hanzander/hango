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
          Join hango
        </h1>
        <p className="mb-8 max-w-sm text-center text-sm text-text-secondary">
          Create an account to{" "}
          <span className="text-text">hango</span>
          <span className="text-text-secondary">ut with your people.</span>
        </p>
        <AuthForm mode="signup" />
      </main>
    </div>
  );
}
