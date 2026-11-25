export type PublicModel = {
  id: number;
  title: string;
  category: string;
  tags: string[];
  image: string;
  likes: number;
  uses: number;
  accent: string;
  phrase: string;
};

export const starterModels: PublicModel[] = [
  { id: 1, title: "Onde há amor, há lar", category: "Família", tags: ["amor", "casa", "presente"], image: "/models/modelo-floral.webp", likes: 284, uses: 91, accent: "coral", phrase: "Onde há amor, há lar" },
  { id: 2, title: "Leve a vida no seu ritmo", category: "Mato Grosso", tags: ["capivara", "pantanal", "humor"], image: "/models/modelo-pantanal.webp", likes: 516, uses: 167, accent: "sage", phrase: "Leve a vida no seu ritmo" },
  { id: 3, title: "Deus cuida de cada detalhe", category: "Fé", tags: ["fé", "católica", "presente"], image: "/models/modelo-fe.webp", likes: 391, uses: 133, accent: "blue", phrase: "Deus cuida de cada detalhe" },
  { id: 4, title: "Professora que inspira", category: "Profissões", tags: ["professora", "gratidão", "escola"], image: "", likes: 228, uses: 74, accent: "lavender", phrase: "Professora que inspira todos os dias" },
  { id: 5, title: "Mãe, meu lugar favorito", category: "Mães", tags: ["mãe", "afeto", "flores"], image: "", likes: 633, uses: 208, accent: "rose", phrase: "Mãe, você é meu lugar favorito" },
  { id: 6, title: "Café primeiro, decisões depois", category: "Humor", tags: ["café", "humor", "rotina"], image: "", likes: 472, uses: 156, accent: "coffee", phrase: "Café primeiro, decisões depois" },
];

export function parseTags(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function toPublicModel(row: Record<string, unknown>): PublicModel {
  return {
    id: Number(row.id),
    title: String(row.title || "Modelo de caneca"),
    category: String(row.category || "Presentes"),
    tags: parseTags(String(row.tags || "[]")),
    image: String(row.imageUrl || ""),
    likes: Number(row.likes || 0),
    uses: Number(row.uses || 0),
    accent: String(row.accent || "blue"),
    phrase: String(row.phrase || row.title || "Caneca personalizada"),
  };
}
