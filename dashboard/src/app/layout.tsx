import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
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
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-6 ml-0 sm:ml-64">{children}</main>
          </div>
        </AuthGuard>
      </body>
    </html>
  );
}
