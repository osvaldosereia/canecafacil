import type { Metadata, Viewport } from "next";
import { getSiteUrl } from "../lib/seo";
import "./globals.css";
import "./capineca.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "CapiNeca — canecas personalizadas para marcas e eventos", template: "%s | CapiNeca" },
  description: "Canecas personalizadas para empresas, profissionais e eventos. R$ 19,90 por unidade, pedido mínimo de 10, entrega grátis em Cuiabá e Várzea Grande.",
  applicationName: "CapiNeca",
  category: "shopping",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "CapiNeca",
    title: "CapiNeca — canecas com identidade",
    description: "Sua marca também merece um lugar à mesa. Canecas personalizadas para empresas e eventos.",
    url: "/",
    images: [{ url: "/images/capineca-hero-mugs.webp", width: 1400, height: 716, alt: "Canecas personalizadas CapiNeca" }],
  },
  twitter: { card: "summary_large_image", title: "CapiNeca — canecas com identidade", description: "Canecas personalizadas para empresas e eventos.", images: ["/images/capineca-hero-mugs.webp"] },
  other: { "codex-preview": "development" },
  icons: { icon: "/brand/capineca-icon.webp", shortcut: "/brand/capineca-icon.webp", apple: "/brand/capineca-icon.webp" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light", themeColor: "#F6EFDF" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CapiNeca",
    url: getSiteUrl(),
    description: "Canecas personalizadas para empresas, profissionais e eventos.",
    inLanguage: "pt-BR",
    potentialAction: {
      "@type": "SearchAction",
      target: `${getSiteUrl()}/?busca={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  return <html lang="pt-BR"><body><a className="skip-link" href="#conteudo-principal">Ir para o conteúdo principal</a>{children}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema).replace(/</g, "\\u003c") }} /><noscript><p className="noscript-note">Ative o JavaScript para criar as propostas de canecas personalizadas.</p></noscript></body></html>;
}
