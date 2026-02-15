import type { Metadata } from "next";
import "./globals.css";
import { AuthGuard } from "@/components/AuthGuard";

export const metadata: Metadata = {
  title: "BDOI Vanguard — Admin Dashboard",
  description: "Anti-cheat monitoring dashboard for BDOI contests",
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
