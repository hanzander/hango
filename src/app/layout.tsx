import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { AppearanceProvider } from "@/components/ui/Appearance";
import { AuthCoverClearer } from "@/components/auth/AuthCoverClearer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hango",
  description: "Clean, minimal chat for people who hang out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-bg font-sans text-text antialiased">
        <AppearanceProvider>
          <AuthCoverClearer />
          <ToastProvider>{children}</ToastProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
