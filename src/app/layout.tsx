import type { Metadata, Viewport } from "next";
import "./globals.css";
import EnvironmentBadge from "@/components/EnvironmentBadge";

export const metadata: Metadata = {
  title: "BIK Prestige Enterprise - Management Platform",
  description: "BIK Prestige Enterprise Management Platform — Built by BloomCore Technologies",
  manifest: "/manifest.json",
  icons: {
    icon: "/branding/bik-prestige-icon.svg",
    apple: "/branding/bik-prestige-icon.svg",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "BIK Prestige" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16a34a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <EnvironmentBadge />
        {children}
      </body>
    </html>
  );
}
