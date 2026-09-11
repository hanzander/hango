import type { Metadata } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
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

const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Hango",
  description: "A calm place to hangout with your people.",
  icons: {
    icon: [
      { url: "/brand/icon.png", type: "image/png" },
      { url: "/brand/mark.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png" }],
  },
  openGraph: {
    title: "Hango",
    description: "A calm place to hangout with your people.",
    images: [{ url: "/brand/icon.png" }],
  },
};

function livekitPreconnectOrigin() {
  const raw = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!raw) return null;
  try {
    const normalized = raw
      .replace(/^wss:/i, "https:")
      .replace(/^ws:/i, "http:");
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const livekitOrigin = livekitPreconnectOrigin();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {livekitOrigin ? (
          <>
            <link rel="dns-prefetch" href={livekitOrigin} />
            <link
              rel="preconnect"
              href={livekitOrigin}
              crossOrigin="anonymous"
            />
          </>
        ) : null}
      </head>
      <body className="min-h-full bg-bg font-sans text-text antialiased">
        <AppearanceProvider>
          <AuthCoverClearer />
          <ToastProvider>{children}</ToastProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
