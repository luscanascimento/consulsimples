import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "consusimples",
  description: "Gestão de restaurante",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
