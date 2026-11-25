"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { CapinecaSiteContent, PortfolioSample } from "../lib/capineca-content";

type Concept = { name: string; strategy: string; artUrl: string; index: number };
type Brief = { brand_summary?: string; audience?: string; tone?: string; palette?: string[]; insights?: string[] };
type Job = { id: string; token: string };
const CONCEPT_COUNT = 4;

function Icon({ name }: { name: "arrow" | "spark" | "upload" | "check" | "download" | "copy" | "coffee" }) {
  const content = {
    arrow: <><path d="M4 12h15" /><path d="m13 5 7 7-7 7" /></>,
    spark: <><path d="m12 3-1.3 5.2L6 10l4.7 1.8L12 17l1.3-5.2L18 10l-4.7-1.8L12 3Z" /><path d="m19 15-.7 2.3L16 18l2.3.7L19 21l.7-2.3L22 18l-2.3-.7L19 15Z" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    coffee: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" /><path d="M17 10h2a2.5 2.5 0 0 1 0 5h-2M7 4c0 1 1 1 1 2M12 4c0 1 1 1 1 2" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{content[name]}</svg>;
}

function makeImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function removeUniformLogoBackground(source: HTMLImageElement) {
  const scale = Math.min(1, 900 / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const sampleCorner = (x0: number, y0: number) => {
    let red = 0, green = 0, blue = 0, alpha = 0, count = 0;
    for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) {
      const offset = (y * width + x) * 4;
      red += data[offset]; green += data[offset + 1]; blue += data[offset + 2]; alpha += data[offset + 3]; count++;
    }
    return [red / count, green / count, blue / count, alpha / count];
  };
  if (width < 12 || height < 12) return source;
  const corners = [sampleCorner(2, 2), sampleCorner(width - 7, 2), sampleCorner(2, height - 7), sampleCorner(width - 7, height - 7)];
  if (corners.some((color) => color[3] < 235)) return source;
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
  const colorDistance = (offset: number) => Math.hypot(data[offset] - background[0], data[offset + 1] - background[1], data[offset + 2] - background[2]);
  if (corners.some((color) => Math.hypot(color[0] - background[0], color[1] - background[1], color[2] - background[2]) > 34)) return source;

  const pixels = width * height;
  const seen = new Uint8Array(pixels);
  const queue = new Uint32Array(pixels);
  let head = 0, tail = 0;
  const add = (pixel: number) => {
    if (seen[pixel]) return;
    const offset = pixel * 4;
    if (data[offset + 3] < 5 || colorDistance(offset) > 58) return;
    seen[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const pixel = queue[head++];
    const offset = pixel * 4;
    const distance = colorDistance(offset);
    if (distance <= 22) data[offset + 3] = 0;
    else data[offset + 3] = Math.round(data[offset + 3] * Math.min(1, (distance - 22) / 36));
    const x = pixel % width, y = Math.floor(pixel / width);
    if (x > 0) add(pixel - 1);
    if (x + 1 < width) add(pixel + 1);
    if (y > 0) add(pixel - width);
    if (y + 1 < height) add(pixel + width);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function MugMockup({ artUrl, logoUrl, company, phone, website, index }: { artUrl: string; logoUrl: string; company: string; phone: string; website: string; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawError, setDrawError] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([makeImage("/images/capineca-blank-pair.webp"), makeImage(artUrl), makeImage(logoUrl)]).then(([base, art, logo]) => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = base.naturalWidth;
      canvas.height = base.naturalHeight;
      ctx.drawImage(base, 0, 0);
      ctx.scale(canvas.width / 1254, canvas.height / 1254);
      const adaptedLogo = removeUniformLogoBackground(logo);
      const mugs = [
        { x: 218, y: 422, w: 380, h: 458 },
        { x: 650, y: 422, w: 397, h: 458 },
      ];
      mugs.forEach((mug, side) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(mug.x + 7, mug.y + 9);
        ctx.quadraticCurveTo(mug.x + mug.w / 2, mug.y - 2, mug.x + mug.w - 6, mug.y + 10);
        ctx.lineTo(mug.x + mug.w - 2, mug.y + mug.h - 20);
        ctx.quadraticCurveTo(mug.x + mug.w / 2, mug.y + mug.h + 10, mug.x + 4, mug.y + mug.h - 20);
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = 0.96;
        ctx.drawImage(art, mug.x + 18, mug.y + 105, mug.w - 36, 148);
        ctx.globalAlpha = 1;
        if (side === 0) {
          ctx.drawImage(adaptedLogo, mug.x + 139, mug.y + 267, 98, 98);
          ctx.fillStyle = "#34221b";
          ctx.font = "600 20px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(company || "Sua marca", mug.x + mug.w / 2, mug.y + 400, mug.w - 36);
        } else {
          ctx.textAlign = "center";
          ctx.fillStyle = "#a04a3b";
          ctx.font = "700 13px Arial, sans-serif";
          if (phone || website) ctx.fillText("FALE COM A GENTE", mug.x + mug.w / 2, mug.y + 318, mug.w - 34);
          ctx.fillStyle = "#34221b";
          ctx.font = "600 19px Arial, sans-serif";
          if (phone) ctx.fillText(phone, mug.x + mug.w / 2, mug.y + 355, mug.w - 34);
          if (website) {
            ctx.font = "16px Arial, sans-serif";
            ctx.fillText(website.replace(/^https?:\/\//, "").replace(/\/+$/, ""), mug.x + mug.w / 2, mug.y + 388, mug.w - 34);
          }
        }
        ctx.restore();
      });
      setDrawError(false);
    }).catch(() => { if (active) setDrawError(true); });
    return () => { active = false; };
  }, [artUrl, logoUrl, company, phone, website]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `capineca-conceito-${index + 1}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  return <div className="mockup-frame">
    {drawError && <div className="mockup-error">A prévia visual não carregou. Atualize a página para tentar novamente.</div>}
    <canvas ref={canvasRef} aria-label={`Mockup do conceito ${index + 1}, mostrando frente e verso de duas canecas`} />
    <button type="button" className="download-preview" onClick={download}><Icon name="download" /> Baixar prévia</button>
  </div>;
}

function drawSampleMark(ctx: CanvasRenderingContext2D, x: number, y: number, sample: PortfolioSample) {
  const [primary, accent] = sample.palette;
  ctx.save();
  ctx.strokeStyle = primary;
  ctx.fillStyle = primary;
  ctx.lineWidth = 2.5;
  if (sample.style === "minimal") {
    ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = "600 26px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(sample.mark, x, y + 1);
  } else if (sample.style === "pattern") {
    ctx.beginPath(); ctx.moveTo(x, y + 25); ctx.bezierCurveTo(x - 38, y + 2, x - 23, y - 32, x, y - 21); ctx.bezierCurveTo(x + 25, y - 33, x + 39, y + 2, x, y + 25); ctx.closePath(); ctx.stroke();
    ctx.font = "600 20px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(sample.mark, x, y + 2);
  } else if (sample.style === "edges") {
    ctx.beginPath(); ctx.moveTo(x - 28, y + 25); ctx.lineTo(x - 28, y - 10); ctx.quadraticCurveTo(x - 28, y - 37, x, y - 37); ctx.quadraticCurveTo(x + 28, y - 37, x + 28, y - 10); ctx.lineTo(x + 28, y + 25); ctx.stroke();
    ctx.font = "600 24px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(sample.mark, x, y + 4);
  } else {
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    for (let ray = 0; ray < 8; ray++) {
      const angle = (Math.PI * 2 * ray) / 8;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 31, y + Math.sin(angle) * 31); ctx.lineTo(x + Math.cos(angle) * 38, y + Math.sin(angle) * 38); ctx.stroke();
    }
    ctx.font = "600 19px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(sample.mark, x, y + 1);
  }
  ctx.restore();
}

function PortfolioMugMockup({ sample }: { sample: PortfolioSample }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    if (sample.imageUrl) return () => { active = false; };
    makeImage("/images/capineca-blank-pair.webp").then((base) => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = base.naturalWidth;
      canvas.height = base.naturalHeight;
      ctx.drawImage(base, 0, 0);
      ctx.scale(canvas.width / 1254, canvas.height / 1254);
      const mugs = [{ x: 218, y: 422, w: 380, h: 458 }, { x: 650, y: 422, w: 397, h: 458 }];
      mugs.forEach((mug, side) => {
        const center = mug.x + mug.w / 2;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(mug.x + 7, mug.y + 9);
        ctx.quadraticCurveTo(center, mug.y - 2, mug.x + mug.w - 6, mug.y + 10);
        ctx.lineTo(mug.x + mug.w - 2, mug.y + mug.h - 20);
        ctx.quadraticCurveTo(center, mug.y + mug.h + 10, mug.x + 4, mug.y + mug.h - 20);
        ctx.closePath();
        ctx.clip();

      const [primary, accent, pale] = sample.palette;
        if (sample.style === "minimal") {
          ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.moveTo(mug.x + 70, mug.y + 145); ctx.lineTo(mug.x + mug.w - 70, mug.y + 145); ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (sample.style === "pattern") {
          ctx.save(); ctx.globalAlpha = 0.14; ctx.strokeStyle = pale; ctx.fillStyle = pale; ctx.lineWidth = 2;
          for (let x = mug.x + 28; x < mug.x + mug.w - 10; x += 44) {
            for (let y = mug.y + 95; y < mug.y + 385; y += 46) {
              const awayFromCenter = Math.abs(x - center) > 92 || y < mug.y + 155 || y > mug.y + 310;
              if (awayFromCenter) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
            }
          }
          ctx.restore();
        } else if (sample.style === "edges") {
          ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = accent;
          ctx.beginPath(); ctx.moveTo(mug.x + 8, mug.y + 110); ctx.quadraticCurveTo(mug.x + 78, mug.y + 215, mug.x + 18, mug.y + 325); ctx.lineTo(mug.x + 8, mug.y + 325); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(mug.x + mug.w - 8, mug.y + 95); ctx.quadraticCurveTo(mug.x + mug.w - 77, mug.y + 210, mug.x + mug.w - 16, mug.y + 330); ctx.lineTo(mug.x + mug.w - 8, mug.y + 330); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.7; ctx.strokeStyle = primary; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mug.x + 26, mug.y + 125); ctx.quadraticCurveTo(mug.x + 78, mug.y + 210, mug.x + 30, mug.y + 310); ctx.stroke();
          ctx.restore();
        } else {
          ctx.save(); ctx.globalAlpha = 0.17; ctx.fillStyle = pale;
          ctx.beginPath(); ctx.moveTo(mug.x + 2, mug.y + mug.h - 98); ctx.bezierCurveTo(mug.x + 105, mug.y + mug.h - 160, mug.x + 225, mug.y + mug.h - 44, mug.x + mug.w - 2, mug.y + mug.h - 120); ctx.lineTo(mug.x + mug.w - 2, mug.y + mug.h - 16); ctx.quadraticCurveTo(center, mug.y + mug.h + 8, mug.x + 2, mug.y + mug.h - 16); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.58; ctx.strokeStyle = accent; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mug.x + 10, mug.y + mug.h - 82); ctx.bezierCurveTo(mug.x + 120, mug.y + mug.h - 143, mug.x + 240, mug.y + mug.h - 30, mug.x + mug.w - 8, mug.y + mug.h - 102); ctx.stroke();
          ctx.restore();
        }

        if (side === 0) {
          drawSampleMark(ctx, center, mug.y + 225, sample);
          ctx.fillStyle = primary; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
          ctx.font = "600 19px Arial, sans-serif"; ctx.fillText(sample.brand, center, mug.y + 340, mug.w - 34);
          ctx.fillStyle = accent; ctx.font = "700 12px Arial, sans-serif"; ctx.fillText(sample.descriptor, center, mug.y + 366, mug.w - 34);
        } else {
          drawSampleMark(ctx, center, mug.y + 205, sample);
          ctx.fillStyle = accent; ctx.textAlign = "center"; ctx.font = "700 11px Arial, sans-serif";
          ctx.fillText("CONTATO", center, mug.y + 309, mug.w - 34);
          ctx.fillStyle = primary; ctx.font = "600 16px Arial, sans-serif";
          ctx.fillText(sample.phone, center, mug.y + 342, mug.w - 32);
          ctx.font = "13px Arial, sans-serif";
          ctx.fillText(`www.${sample.website}`, center, mug.y + 370, mug.w - 28);
        }
        ctx.restore();
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [sample]);
  return sample.imageUrl
    ? <img className="portfolio-mug" src={sample.imageUrl} alt={`Exemplo fictício de caneca corporativa para ${sample.brand}, com frente e verso`} />
    : <canvas className="portfolio-mug" ref={canvasRef} aria-label={`Exemplo fictício de caneca corporativa para ${sample.brand}, com frente e verso`} />;
}

export default function CapinecaLanding({ content, supabaseUrl, supabaseAnonKey, whatsappNumber }: { content: CapinecaSiteContent; supabaseUrl: string; supabaseAnonKey: string; whatsappNumber: string }) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [purpose, setPurpose] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [city, setCity] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [customizationIdea, setCustomizationIdea] = useState("");
  const [quantity, setQuantity] = useState(String(content.minQuantity));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const number = Number(quantity) || 0;
  const total = number * content.unitPriceCents / 100;

  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const callFunction = async (body: FormData | Record<string, string>) => {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("O personalizador está sendo conectado. Tente novamente em alguns minutos.");
    const isForm = body instanceof FormData;
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/capineca-b2b`, {
      method: "POST",
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, ...(isForm ? {} : { "content-type": "application/json" }) },
      body: isForm ? body : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Não foi possível gerar agora. Tente de novo.");
    return payload;
  };

  const continueGeneration = async (activeJob: Job) => {
    setBusy(true);
    setError("");
    let completed = concepts.length;
    let researchReady = Boolean(brief);
    try {
      for (let turn = 0; turn < CONCEPT_COUNT + 2; turn++) {
        setStage(completed === 0 && !researchReady ? "Pesquisando a marca e montando quatro caminhos visuais" : `Criando proposta ${Math.min(completed + 1, CONCEPT_COUNT)} de ${CONCEPT_COUNT}`);
        const payload = await callFunction({ action: "advance", id: activeJob.id, token: activeJob.token });
        const returnedBrief = payload.brief as Brief | undefined;
        if (returnedBrief) { setBrief(returnedBrief); researchReady = true; }
        const next = Array.isArray(payload.concepts) ? payload.concepts as Concept[] : [];
        setConcepts(next);
        completed = next.length;
        setProgress(next.length);
        if (payload.status === "ready" || next.length >= CONCEPT_COUNT) { setStage("Quatro conceitos prontos"); break; }
        if (typeof payload.stage === "string" && payload.stage === "research_done") setStage("Pesquisa concluída. Definindo quatro direções criativas.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A geração foi interrompida. Você pode continuar de onde parou.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!logoFile) { setError("Envie a logo da empresa para gerar os conceitos."); return; }
    if (number < content.minQuantity) { setError(`O pedido mínimo é de ${content.minQuantity} canecas.`); return; }
    if (logoFile.size > 8 * 1024 * 1024) { setError("A logo precisa ter no máximo 8 MB."); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(logoFile.type)) { setError("Use uma imagem PNG, JPG ou WebP."); return; }
    setConcepts([]); setBrief(null); setProgress(0); setJob(null); setBusy(true); setStage("Preparando o briefing seguro da sua marca");
    try {
      const form = new FormData();
      form.set("action", "create");
      form.set("logo", logoFile);
      form.set("company", company);
      form.set("businessPhone", businessPhone);
      form.set("website", website);
      form.set("customizationIdea", customizationIdea);
      form.set("quantity", quantity);
      form.set("sector", sector);
      form.set("purpose", purpose);
      form.set("contactName", contactName);
      form.set("contactPhone", contactPhone);
      form.set("city", city);
      form.set("consent", "true");

      const leadForm = new FormData(event.currentTarget);
      const leadResponse = await fetch("/api/b2b/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company, sector, purpose, quantity: number, city, businessPhone, businessWebsite: website,
          customizationIdea, contactName, contactPhone, websiteCheck: String(leadForm.get("websiteCheck") || ""),
        }),
      });
      const leadResult = await leadResponse.json().catch(() => ({})) as { error?: string; ignored?: boolean };
      if (!leadResponse.ok) throw new Error(leadResult.error || "Não foi possível registrar seu pedido de orçamento.");
      if (leadResult.ignored) { setBusy(false); setNotice("Obrigado pelo contato."); return; }

      const payload = await callFunction(form);
      const created = payload.job as Job;
      if (!created?.id || !created?.token) throw new Error("Não foi possível iniciar seu projeto. Tente novamente.");
      setJob(created);
      setBusy(false);
      await continueGeneration(created);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a personalização.");
    }
  };

  const reset = () => { setJob(null); setConcepts([]); setBrief(null); setProgress(0); setError(""); setStage(""); document.getElementById("personalizar")?.scrollIntoView({ behavior: "smooth" }); };
  const contactText = `Olá! Quero um orçamento de canecas personalizadas da CapiNeca.\nEmpresa: ${company || ""}\nQuantidade: ${quantity || String(content.minQuantity)} unidades\nTelefone impresso: ${businessPhone || "não informado"}\nSite impresso: ${website || "não informado"}\nIdeia de personalização: ${customizationIdea || "não informada"}\nMeu contato: ${contactName} ${contactPhone}`;
  const whatsappHref = whatsappNumber.replace(/\D/g, "") ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(contactText)}` : "";

  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(contactText); setNotice("Mensagem copiada. O WhatsApp dedicado será ativado em breve."); }
    catch { setNotice("O WhatsApp dedicado será ativado em breve."); }
  };

  return <main className="capineca" id="conteudo-principal">
    <header className="cn-header">
      <a className="cn-brand" href="#inicio" aria-label="CapiNeca início"><Image src="/brand/capineca-logo.webp" alt="" width={58} height={58} priority unoptimized /><span>CapiNeca<small>canecas com identidade</small></span></a>
      <nav aria-label="Navegação principal"><a href="#ideias">Inspirações</a><a href="#como-funciona">Como funciona</a><a href="#oferta">Investimento</a></nav>
      <a className="cn-header-cta" href="#personalizar">Criar meus conceitos <Icon name="arrow" /></a>
    </header>

    <section className="cn-hero" id="inicio">
      <div className="hero-copy"><div className="cn-kicker"><span className="kicker-dot" /> SUA MARCA, PRESENTE NO DIA A DIA</div>
        <h1>{content.heroTitle}<br /><em>{content.heroEmphasis}</em></h1>
        <p>{content.heroDescription}</p>
        <div className="hero-buttons"><a className="cn-button primary" href="#personalizar">Criar 4 ideias para minha marca <Icon name="arrow" /></a><a className="text-link" href="#ideias">Ver inspirações <span>↓</span></a></div>
        <div className="hero-proof"><span><Icon name="check" /> Arte pensada para você</span><span><Icon name="check" /> Prévia frente e verso</span></div>
      </div>
      <div className="hero-visual"><img className="hero-photo" src={content.heroImage} alt="Canecas brancas com alças brancas e grafismos corporativos coloridos na área impressa" width={1672} height={941} /><div className="hero-stamp"><span>feito para</span><strong>ficar<br />por perto</strong><i>✳</i></div><div className="photo-note"><Icon name="coffee" /><span>Um detalhe útil.<br /><strong>Uma marca lembrada.</strong></span></div></div>
    </section>

    <section className="cn-offer-strip" id="oferta"><div className="offer-price"><small>PREÇO POR UNIDADE</small><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(content.unitPriceCents / 100)}</strong><span>pedido mínimo: {content.minQuantity} canecas <b>·</b> mínimo {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(content.minQuantity * content.unitPriceCents / 100)}</span></div><div className="offer-divider" /><div className="offer-item"><span className="offer-icon">↗</span><p><strong>Entrega grátis</strong><small>{content.deliveryCities}</small></p></div><div className="offer-item"><span className="offer-icon">3×</span><p><strong>{content.installmentText.split(" no ")[0]}</strong><small>{content.installmentText.includes("no ") ? `No ${content.installmentText.split("no ").slice(1).join("no ")}` : "No cartão de crédito"}</small></p></div><div className="offer-note">Você aprova a proposta e fecha pelo WhatsApp. Sem pagamento online.</div></section>

    <section className="cn-section idea-section" id="ideias"><div className="section-heading"><div><span className="cn-kicker">PEQUENAS SÉRIES. GRANDES IDEIAS.</span><h2>Feitas para trabalhar<br />a favor da sua marca.</h2></div><p>Uma lembrança útil aproxima. Uma boa personalização transforma esse objeto em parte da história da sua empresa, do seu evento ou do seu trabalho.</p></div><div className="idea-grid">{content.portfolio.map((item, index) => <article className={`idea-card ${item.color}`} key={item.label}><div className="idea-image"><PortfolioMugMockup sample={item} /></div><div className="idea-meta"><span>0{index + 1} / {item.label}</span><h3>{item.title}</h3><small className="idea-disclaimer">Logo, nome e contato fictícios para demonstração.</small><a href="#personalizar">Criar uma proposta <Icon name="arrow" /></a></div></article>)}</div></section>

    <section className="cn-process" id="como-funciona"><div className="process-intro"><span className="cn-kicker">DO BRIEFING À PRÉVIA</span><h2>Uma ideia feita<br /><em>para a sua empresa.</em></h2><p>A gente entende a marca antes de propor a arte. Você vê quatro caminhos e escolhe com calma.</p><a href="#personalizar" className="text-link">Começar agora <span>↓</span></a></div><div className="process-steps"><article><b>01</b><div><h3>Conte o contexto</h3><p>Envie sua logo e diga para quem são as canecas, quantas precisa e como imagina a personalização.</p></div></article><article><b>02</b><div><h3>Analisamos a marca</h3><p>Se você informar o site, pesquisamos as informações públicas para orientar cores, tom e estilo. O endereço também será aplicado na caneca.</p></div></article><article><b>03</b><div><h3>Veja quatro propostas</h3><p>Receba quatro conceitos em mockups que mostram os dois lados. A logo original é aplicada como arquivo, sem redesenho pela IA.</p></div></article><article><b>04</b><div><h3>Escolha e converse</h3><p>Use a prévia para solicitar seu orçamento. Pagamento e fechamento são combinados pelo WhatsApp.</p></div></article></div></section>

    <section className="cn-personalizer" id="personalizar"><div className="personalizer-head"><div><span className="cn-kicker">SEU PRÓXIMO BRINDE COMEÇA AQUI</span><h2>Vamos imaginar<br /><em>as suas canecas?</em></h2></div><div className="minimum-chip"><span>10</span><small>unidades<br />mínimas</small></div></div>
      {!job && <form className="personalizer-form" onSubmit={submit}>
        <div className="form-main"><div className="form-step-title"><b>1</b><div><h3>Conte sobre sua marca</h3><p>Esses dados orientam as quatro propostas.</p></div></div>
          <div className="form-grid"><label className="field full">Nome da empresa ou profissional<input value={company} onChange={e => setCompany(e.target.value)} placeholder="Ex.: Ateliê Aurora" maxLength={100} required /></label>
            <label className="field">Seu segmento<input value={sector} onChange={e => setSector(e.target.value)} placeholder="Ex.: advocacia, odontologia, eventos" maxLength={100} required /></label>
            <label className="field">Para qual ocasião?<select value={purpose} onChange={e => setPurpose(e.target.value)} required><option value="" disabled>Selecione uma opção</option><option>Presente para clientes</option><option>Brinde corporativo</option><option>Evento ou congresso</option><option>Equipe e colaboradores</option><option>Produto para venda</option><option>Outro</option></select></label>
            <label className="field">Quantidade<input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min={content.minQuantity} max={10000} step={1} required /><small>Mínimo de {content.minQuantity} canecas. Estimativa: <strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}</strong></small></label>
            <label className="field">Cidade da entrega<input value={city} onChange={e => setCity(e.target.value)} placeholder="Ex.: Cuiabá - MT" maxLength={80} /></label>
          </div>
          <div className="form-step-title second-step"><b>2</b><div><h3>Escolha o que vai na caneca</h3><p>O telefone e o site serão compostos como texto exato.</p></div></div>
          <div className="form-grid"><label className="field">Telefone para imprimir<input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="(65) 99999-9999" inputMode="tel" maxLength={24} /></label><label className="field">Site da empresa (opcional)<input value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.suaempresa.com.br" maxLength={180} type="text" /><small>Se informar, o endereço será impresso na caneca e o domínio ajudará na análise da marca.</small></label>
            <label className="field full">Como você imagina a personalização? (opcional)<textarea value={customizationIdea} onChange={e => setCustomizationIdea(e.target.value)} placeholder="Ex.: uma arte elegante com as cores da minha empresa, nossa logo em destaque e uma frase para presentear clientes." maxLength={500} rows={4} /><small>Conte a ideia, o estilo, as cores ou a mensagem que gostaria de ver na caneca.</small></label>
          </div>
          <label className="field upload-field"><span className="field-label">Logo da empresa <i>obrigatória</i></span><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0] || null; setLogoFile(file); setLogoPreview(file ? URL.createObjectURL(file) : ""); setError(""); }} /><span className="upload-box"><span className="upload-icon"><Icon name="upload" /></span><strong>{logoFile ? logoFile.name : "Toque para enviar sua logo"}</strong><small>PNG, JPG ou WebP · até 8 MB</small>{logoPreview && <Image src={logoPreview} alt="Prévia da logo enviada" width={66} height={66} unoptimized />}</span><small className="logo-preservation">A IA não redesenha sua marca. Remove apenas fundo sólido uniforme no mockup; o arquivo original fica intacto.</small></label>
          <div className="contact-fields"><div className="form-step-title"><b>3</b><div><h3>Como falar com você</h3><p>O número abaixo é para retorno sobre seu orçamento, não será impresso.</p></div></div><div className="form-grid"><label className="field">Seu nome<input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Como podemos chamar você?" maxLength={100} required /></label><label className="field">Seu telefone de contato<input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(65) 99999-9999" inputMode="tel" maxLength={24} required /></label></div></div>
          <label className="consent-line"><input type="checkbox" required /><span>Autorizo a análise das informações públicas do site que eu informar e o uso dos dados enviados para criar esta prévia, registrar meu pedido de orçamento e responder ao meu contato.</span></label>
          <label className="cn-honeypot" aria-hidden="true">Site<input name="websiteCheck" tabIndex={-1} autoComplete="off" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="cn-button primary form-submit" type="submit" disabled={busy}><Icon name="spark" /> Gerar quatro propostas para minha marca <Icon name="arrow" /></button>
          <p className="form-footnote">A prévia não é um pedido. Você aprova a direção antes de conversar sobre produção e entrega.</p>
        </div>
        <aside className="form-summary"><span className="cn-kicker">SUA ESTIMATIVA</span><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(content.unitPriceCents / 100)} <small>/ unidade</small></strong><div className="summary-line"><span>Pedido mínimo</span><b>{content.minQuantity} un. · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(content.minQuantity * content.unitPriceCents / 100)}</b></div><div className="summary-line"><span>Entrega</span><b>Grátis em {content.deliveryCities}</b></div><div className="summary-line"><span>Pagamento</span><b>{content.installmentText}</b></div><div className="summary-sketch"><Image src="/brand/capineca-icon.webp" alt="Mascote capivara CapiNeca" width={104} height={104} unoptimized /><p>Quatro caminhos visuais<br /><strong>com a sua marca no centro.</strong></p></div><small className="summary-disclaimer">Valor unitário informado para a caneca personalizada. Frete grátis local nas cidades indicadas. Produção e prazo são confirmados no orçamento.</small></aside>
      </form>}

      {busy && <div className="generation-panel" aria-live="polite"><div className="generation-top"><div className="loader-spark"><Icon name="spark" /></div><div><span className="cn-kicker">ESTÚDIO CAPINECA</span><h3>{stage || "Preparando seu projeto"}</h3><p>A análise e a geração acontecem em etapas. Deixe esta página aberta.</p></div></div><div className="generation-progress"><span style={{ width: `${Math.max(8, (progress / CONCEPT_COUNT) * 100)}%` }} /></div><div className="generation-status"><span>{progress} de {CONCEPT_COUNT} propostas prontas</span><span>Pesquisa · direção · mockups</span></div></div>}

      {!busy && job && <div className="results-panel"><div className="results-head"><div><span className="cn-kicker">PROJETO PERSONALIZADO</span><h3>{concepts.length === CONCEPT_COUNT ? "Quatro caminhos para sua marca." : "Continue suas propostas."}</h3><p>{brief?.brand_summary || "A pesquisa orientou estas propostas para o perfil informado."}</p></div><button className="reset-button" onClick={reset}>Editar briefing</button></div>
        {brief && <div className="research-summary"><span><b>Direção</b>{brief.tone || "Identidade da marca"}</span><span><b>Público</b>{brief.audience || "Seu público"}</span><span><b>Paleta sugerida</b>{brief.palette?.slice(0, 5).join(" · ") || "Adaptada à sua logo"}</span></div>}
        {error && <div className="resume-alert" role="alert"><p>{error}</p><button className="cn-button secondary" onClick={() => job && continueGeneration(job)}>Continuar de onde parou <Icon name="arrow" /></button></div>}
        <div className="concept-grid">{concepts.map((concept, index) => <article className="concept-card" key={`${concept.index}-${concept.name}`}><div className="concept-heading"><span>CONCEITO 0{index + 1}</span><h4>{concept.name}</h4><p>{concept.strategy}</p></div><MugMockup artUrl={concept.artUrl} logoUrl={logoPreview} company={company} phone={businessPhone} website={website} index={index} /></article>)}</div>
        {concepts.length === CONCEPT_COUNT && <div className="close-panel"><div><span className="cn-kicker">ESCOLHA O CAMINHO</span><h3>Qual ideia combina mais com você?</h3><p>As prévias ajudam a conversar sobre quantidade, prazo e acabamento. A produção só começa após confirmação do orçamento.</p></div>{whatsappHref ? <a className="cn-button primary" href={whatsappHref} target="_blank" rel="noreferrer">Pedir orçamento no WhatsApp <Icon name="arrow" /></a> : <button className="cn-button primary" onClick={copyMessage}><Icon name="copy" /> Copiar mensagem para orçamento</button>}</div>}
      </div>}
    </section>

    <section className="cn-final-cta"><Image src="/brand/capineca-icon.webp" alt="" width={118} height={118} unoptimized /><div><span className="cn-kicker">CAPINECA · CANECAS COM IDENTIDADE</span><h2>Uma boa lembrança<br /><em>volta para a mesa.</em></h2></div><a href="#personalizar" className="cn-button light">Criar minhas propostas <Icon name="arrow" /></a></section>
    <footer className="cn-footer"><a className="cn-brand footer-brand" href="#inicio"><Image src="/brand/capineca-logo.webp" alt="" width={45} height={45} unoptimized /><span>CapiNeca<small>canecas com identidade</small></span></a><p>Canecas personalizadas para marcas, pessoas e encontros.</p><span>© 2026 CapiNeca · Orçamentos pelo WhatsApp</span><small>{content.websiteDomain}</small></footer>
    {notice && <div className="cn-toast" role="status">{notice}</div>}
  </main>;
}
