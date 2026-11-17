import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// Tipografía del logo (solo para la marca; el resto de la app usa la fuente del sistema)
const montserrat = Montserrat({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Kakeibo", template: "%s · Kakeibo" },
  description: "Control de tarjetas, meses sin intereses, créditos, ingresos y gastos.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Kakeibo", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0f11",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`h-full ${montserrat.variable}`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
