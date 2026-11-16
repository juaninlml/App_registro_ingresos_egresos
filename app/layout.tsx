import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mis Finanzas", template: "%s · Mis Finanzas" },
  description: "Control de tarjetas, meses sin intereses, créditos, ingresos y gastos.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Mis Finanzas", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
