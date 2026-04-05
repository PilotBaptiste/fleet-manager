import "./globals.css";

export const metadata = {
  title: "Fleet Finance — Suivi financier flotte",
  description: "Outil de suivi financier pour aéroclub",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
