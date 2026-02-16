import type { Metadata } from "next";
import "./globals.css";
import { AuthGuard } from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "BdOI Vanguard — Admin Dashboard",
  description: "Anti-cheat monitoring dashboard for BdOI contests",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-vanguard-bg">
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}
