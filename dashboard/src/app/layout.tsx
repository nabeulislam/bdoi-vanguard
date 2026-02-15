import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

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
      <body className="flex min-h-screen bg-vanguard-bg">
        <Sidebar />
        <main className="flex-1 p-6 ml-64">{children}</main>
      </body>
    </html>
  );
}
