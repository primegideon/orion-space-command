import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  themeColor: "#080c14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "ORION — Deep Space Command Center",
  description: "Orbital Research & Intelligence Orchestration Network — AI-powered space situational awareness.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ORION",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme colour — browser chrome on mobile */}
        <meta name="theme-color" content="#080c14" />

        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ORION" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#0d1520",
              border: "1px solid rgba(0,210,230,0.25)",
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: "12px",
              borderRadius: "10px",
              padding: "10px 14px",
            },
            success: {
              iconTheme: { primary: "#34d399", secondary: "#0d1520" },
            },
            error: {
              iconTheme: { primary: "#f87171", secondary: "#0d1520" },
            },
          }}
        />
      </body>
    </html>
  );
}
