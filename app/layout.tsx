import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SALUNI — par LBZ",
  description: "Plateforme de gestion pour salons de beauté au Cameroun",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="font-sans">
      <body className="antialiased">{children}</body>
    </html>
  );
}
