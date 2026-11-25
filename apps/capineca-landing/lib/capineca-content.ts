export type PortfolioSample = {
  label: string;
  title: string;
  brand: string;
  descriptor: string;
  mark: string;
  phone: string;
  website: string;
  style: "minimal" | "pattern" | "edges" | "flow";
  color: "sage" | "peach" | "lavender";
  palette: [string, string, string];
  imageUrl: string;
};

export type CapinecaSiteContent = {
  heroImage: string;
  heroTitle: string;
  heroEmphasis: string;
  heroDescription: string;
  unitPriceCents: number;
  minQuantity: number;
  deliveryCities: string;
  installmentText: string;
  whatsappNumber: string;
  websiteDomain: string;
  portfolio: PortfolioSample[];
};

export const DEFAULT_SITE_CONTENT: CapinecaSiteContent = {
  heroImage: "/images/capineca-hero-mugs.webp",
  heroTitle: "Uma caneca pode ser só uma caneca.",
  heroEmphasis: "Ou a lembrança da sua marca.",
  heroDescription: "Para empresas, profissionais e eventos que querem transformar um gesto simples em uma experiência que fica.",
  unitPriceCents: 1990,
  minQuantity: 10,
  deliveryCities: "Cuiabá e Várzea Grande",
  installmentText: "3x sem juros no cartão",
  whatsappNumber: "",
  websiteDomain: "www.capineca.com.br",
  portfolio: [
    { label: "ADVOCACIA · MINIMALISTA", title: "Moraes & Vale Advocacia", brand: "Moraes & Vale", descriptor: "ADVOCACIA", mark: "MV", phone: "(65) 0000-0001", website: "moraesvale.example", style: "minimal", color: "sage", palette: ["#233b43", "#b18b53", "#d9e3dc"], imageUrl: "" },
    { label: "SAÚDE · PADRÃO SUAVE", title: "Dra. Lívia Monteiro · Dermatologia", brand: "Dra. Lívia Monteiro", descriptor: "DERMATOLOGIA", mark: "LM", phone: "(65) 0000-0002", website: "liviamonteiro.example", style: "pattern", color: "peach", palette: ["#647b6a", "#b78476", "#e6e9df"], imageUrl: "" },
    { label: "ARQUITETURA · ACABAMENTO LATERAL", title: "Estúdio Horizonte", brand: "Estúdio Horizonte", descriptor: "ARQUITETURA", mark: "EH", phone: "(65) 0000-0003", website: "horizonteatelier.example", style: "edges", color: "lavender", palette: ["#233b43", "#c66a4b", "#dfc9ad"], imageUrl: "" },
    { label: "EVENTOS · COMPOSIÇÃO EM DUAS FACES", title: "Raízes Eventos", brand: "Raízes Eventos", descriptor: "EVENTOS & EXPERIÊNCIAS", mark: "RE", phone: "(65) 0000-0004", website: "raizeseventos.example", style: "flow", color: "sage", palette: ["#31536b", "#d29443", "#dce6e5"], imageUrl: "" },
  ],
};

const text = (value: unknown, fallback: string, limit = 300) => typeof value === "string" ? value.trim().slice(0, limit) : fallback;
const imageUrl = (value: unknown, fallback: string) => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const result = value.trim();
  if (result.startsWith("/")) return result.slice(0, 500);
  try { return new URL(result).protocol === "https:" ? result.slice(0, 500) : fallback; } catch { return fallback; }
};

export function normalizeSiteContent(input: unknown): CapinecaSiteContent {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const incomingPortfolio = Array.isArray(source.portfolio) ? source.portfolio : [];
  const portfolio = DEFAULT_SITE_CONTENT.portfolio.map((fallback, index) => {
    const row = incomingPortfolio[index] && typeof incomingPortfolio[index] === "object" ? incomingPortfolio[index] as Record<string, unknown> : {};
    const palette = Array.isArray(row.palette) ? row.palette : fallback.palette;
    const color = ["sage", "peach", "lavender"].includes(String(row.color)) ? row.color as PortfolioSample["color"] : fallback.color;
    const style = ["minimal", "pattern", "edges", "flow"].includes(String(row.style)) ? row.style as PortfolioSample["style"] : fallback.style;
    return {
      label: text(row.label, fallback.label, 80), title: text(row.title, fallback.title, 100), brand: text(row.brand, fallback.brand, 80),
      descriptor: text(row.descriptor, fallback.descriptor, 80), mark: text(row.mark, fallback.mark, 8), phone: text(row.phone, fallback.phone, 30),
      website: text(row.website, fallback.website, 120), style, color,
      palette: [0, 1, 2].map(position => /^#[0-9a-f]{6}$/i.test(String(palette[position] ?? "")) ? String(palette[position]) : fallback.palette[position]) as [string, string, string],
      imageUrl: imageUrl(row.imageUrl, fallback.imageUrl),
    };
  });
  const price = Number(source.unitPriceCents);
  const minimum = Number(source.minQuantity);
  return {
    heroImage: imageUrl(source.heroImage, DEFAULT_SITE_CONTENT.heroImage),
    heroTitle: text(source.heroTitle, DEFAULT_SITE_CONTENT.heroTitle, 120),
    heroEmphasis: text(source.heroEmphasis, DEFAULT_SITE_CONTENT.heroEmphasis, 120),
    heroDescription: text(source.heroDescription, DEFAULT_SITE_CONTENT.heroDescription, 300),
    unitPriceCents: Number.isFinite(price) ? Math.min(100000, Math.max(1, Math.round(price))) : DEFAULT_SITE_CONTENT.unitPriceCents,
    minQuantity: Number.isFinite(minimum) ? Math.min(10000, Math.max(1, Math.round(minimum))) : DEFAULT_SITE_CONTENT.minQuantity,
    deliveryCities: text(source.deliveryCities, DEFAULT_SITE_CONTENT.deliveryCities, 100),
    installmentText: text(source.installmentText, DEFAULT_SITE_CONTENT.installmentText, 100),
    whatsappNumber: text(source.whatsappNumber, DEFAULT_SITE_CONTENT.whatsappNumber, 30),
    websiteDomain: text(source.websiteDomain, DEFAULT_SITE_CONTENT.websiteDomain, 120),
    portfolio,
  };
}

