import Image from "next/image";
import { PublicModel } from "../lib/models";
import { modelImageAlt } from "../lib/seo";

export default function SeoModelArtwork({ model, priority = false }: { model: PublicModel; priority?: boolean }) {
  if (model.image) return <Image className="seo-art-image" src={model.image} alt={modelImageAlt(model)} width={1254} height={1254} sizes="(max-width: 760px) calc(100vw - 32px), 590px" priority={priority} unoptimized />;
  return <div className={`seo-art-placeholder ${model.accent}`} role="img" aria-label={modelImageAlt(model)}><small>ARTE PARA CANECA PERSONALIZADA</small><strong>{model.phrase}</strong><span>✦ · ✦</span></div>;
}
