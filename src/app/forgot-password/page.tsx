import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          hango
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text">
          Reset password
        </h1>
        <p className="mb-8 max-w-sm text-center text-sm text-text-secondary">
          We’ll email you a link to choose a new one.
        </p>
        <ForgotPasswordForm />
      </main>
    </div>
  );
}
