import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SALUNI — par LBZ",
  description: "Plateforme de gestion pour salons de beauté au Cameroun",
};

// Injectée au démarrage du conteneur afin qu'une image Docker générique puisse utiliser
// les clés propres à chaque installation locale, sans reconstruire le bundle client.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publicAuthConfig = {
    url: process.env.SUPABASE_PUBLIC_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
  const serializedConfig = JSON.stringify(publicAuthConfig).replaceAll("<", "\\u003c");

  return (
    <html lang="fr" className="font-sans">
      <body className="antialiased">
        <script
          id="saluni-runtime-config"
          dangerouslySetInnerHTML={{
            __html: `globalThis.__SALUNI_PUBLIC_AUTH__=${serializedConfig}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
