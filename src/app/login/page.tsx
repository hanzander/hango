import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/app") ? params.next : "/app";

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="px-6 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-text">
          hango
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text">
          Welcome back
        </h1>
        <p className="mb-8 text-sm text-text-secondary">
          Enter your email and password.
        </p>
        <AuthForm mode="login" nextPath={nextPath} />
      </main>
    </div>
  );
}
