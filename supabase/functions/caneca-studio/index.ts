import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { corsHeaders as supabaseCorsHeaders } from "@supabase/supabase-js/cors";

const TABLE = "caneca_studio_jobs";
const BUCKET = "caneca-studio-assets";
const IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-2.5-sunburst";
const REVIEW_MODEL = Deno.env.get("OPENAI_REVIEW_MODEL")?.trim() || "gpt-6-astra";
const ART_SIZE = "2400x960";
const SIGNED_URL_TTL = 900;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const PUBLIC_APP_ORIGIN = "https://osvaldosereia.github.io";
const PUBLIC_START_LIMIT = 5;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AdminClient = SupabaseClient<any, "public">;
const corsHeaders = {
  ...supabaseCorsHeaders,
  "Access-Control-Allow-Origin": PUBLIC_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-studio-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

type CreationMode = "reference" | "from_scratch";
type Side = "left" | "right";
type GenerationSide = Side | "both";
type StudioInput = {
  title: string;
  creationMode: CreationMode;
  artDescription?: string;
  generationSide?: GenerationSide;
  mandatoryText?: string[];
  // Legacy fields remain readable so existing jobs can still be revised.
  occasion?: string | null;
  recipient?: string | null;
  mainTheme?: string;
  desiredStyle?: string | null;
  colorPreferences?: string[];
  mandatoryElements?: string[];
  forbiddenElements?: string[];
  compositionNotes?: string | null;
  latestEditInstruction?: string | null;
  pendingEdit?: { baseVersion: number; instruction: string; side?: GenerationSide } | null;
  mockupTargetVersion?: number | null;
  mockupReferencePaths?: { version: number; leftPath: string; rightPath: string } | null;
  printing?: PrintState;
  printHistory?: PrintState[];
};
type ReferenceImage = { bytes: Uint8Array; fileName: string; mimeType: string };
type QualityReview = {
  approved: boolean;
  score: number;
  blocking_issues: string[];
  warnings: string[];
  exact_text_ok: boolean | null;
  brief_ok: boolean;
  edges_ok: boolean;
  recommendation: "approve" | "regenerate" | "manual_review";
  concise_note: string;
};
type ArtVersion = {
  version: number;
  path: string;
  source?: "initial" | "operator_edit" | "quality_gate" | "operator_upload";
  parentVersion?: number | null;
  instruction?: string | null;
  createdAt?: string;
  generationSide?: GenerationSide;
};
type MockupAsset = { version: number; side: Side | "front" | "back"; path: string };
type PrintState = {
  approvedVersion: number | null;
  quantity: number;
  completed: number;
  status: "not_queued" | "ready" | "printed";
  approvedAt?: string | null;
  reprints: Array<{ version: number; reason: string; createdAt: string }>;
};
type JobRow = {
  id: string;
  created_by: string | null;
  guest_session_id: string | null;
  title: string;
  input: StudioInput;
  reference_path: string | null;
  status: string;
  processing: boolean;
  processing_started_at: string | null;
  correction_count: number;
  art_versions: ArtVersion[];
  mockups: MockupAsset[];
  validation: QualityReview | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

function emptyPrintState(): PrintState {
  return {
    approvedVersion: null,
    quantity: 1,
    completed: 0,
    status: "not_queued",
    reprints: [],
  };
}

function printState(input: StudioInput): PrintState {
  const value = input.printing;
  if (!value || !Number.isInteger(value.approvedVersion) || !Number.isInteger(value.quantity) ||
    !Number.isInteger(value.completed) || !Array.isArray(value.reprints)) return emptyPrintState();
  return value;
}

function archivePrintState(input: StudioInput): StudioInput {
  const printing = printState(input);
  const history = Array.isArray(input.printHistory) ? [...input.printHistory] : [];
  if (printing.approvedVersion !== null) history.push({ ...printing, reprints: [...printing.reprints] });
  return { ...input, printing: emptyPrintState(), printHistory: history };
}

function isValidJobId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readText(form: FormData, name: string, maxLength: number, required = false): string | null {
  const value = form.get(name);
  if (value === null) {
    if (required) throw new Error("invalid_studio_input");
    return null;
  }
  if (typeof value !== "string") throw new Error("invalid_studio_input");
  const result = value.trim();
  if (result.length > maxLength || (required && !result)) throw new Error("invalid_studio_input");
  return result || null;
}

function readActionText(form: FormData, name: string, maxLength: number): string | null {
  try {
    return readText(form, name, maxLength, true);
  } catch {
    return null;
  }
}

function readList(form: FormData, name: string, maxItems = 12): string[] {
  const text = readText(form, name, 3000) || "";
  const list = text.split("\n").map((item) => item.trim()).filter(Boolean);
  if (list.length > maxItems || list.some((item) => item.length > 200)) {
    throw new Error("invalid_studio_input");
  }
  return list;
}

function detectImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

function imageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (mimeType === "image/webp" && bytes.length >= 30) {
    const readAscii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunk = readAscii(offset, offset + 4);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const size = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (chunk === "VP8X" && data + 10 <= bytes.length) {
        const width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
        const height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16);
        return { width, height };
      }
      if (chunk === "VP8L" && data + 5 <= bytes.length && bytes[data] === 0x2f) {
        const b1 = bytes[data + 1];
        const b2 = bytes[data + 2];
        const b3 = bytes[data + 3];
        const b4 = bytes[data + 4];
        const width = 1 + (((b2 & 0x3f) << 8) | b1);
        const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
        return { width, height };
      }
      if (chunk === "VP8 " && data + 10 <= bytes.length &&
        bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
        const width = ((bytes[data + 7] & 0x3f) << 8) | bytes[data + 6];
        const height = ((bytes[data + 9] & 0x3f) << 8) | bytes[data + 8];
        return { width, height };
      }
      offset = data + size + (size & 1);
    }
  }

  if (mimeType === "image/jpeg" && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (sof.has(marker) && offset + 7 < bytes.length) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        return { width, height };
      }
      if (length < 2) break;
      offset += length;
    }
  }

  return null;
}

async function readUploadedImage(
  form: FormData,
  name: string,
  expectedWidth: number,
  expectedHeight: number,
): Promise<ReferenceImage> {
  const value = form.get(name);
  if (!(value instanceof File) || value.size <= 0 || value.size > MAX_REFERENCE_BYTES ||
    !["image/png", "image/jpeg", "image/webp"].includes(value.type)) {
    throw new Error("invalid_studio_input");
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  const mimeType = detectImageMime(bytes);
  if (!mimeType || mimeType !== value.type) throw new Error("invalid_studio_input");
  const dimensions = imageDimensions(bytes, mimeType);
  if (!dimensions || dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error("invalid_studio_input");
  }
  return { bytes, fileName: value.name || name + "." + safeExtension(mimeType), mimeType };
}

async function parseInput(form: FormData): Promise<{ input: StudioInput; reference: ReferenceImage | null }> {
  const creationMode = readText(form, "creationMode", 20, true);
  // Accept the previous Pages form during its rolling deployment; the new UI sends only artDescription.
  const legacyMainTheme = readText(form, "mainTheme", 500);
  const artDescription = readText(form, "artDescription", 1200) || legacyMainTheme;
  const generationSide = readText(form, "generationSide", 8) || "both";
  if (!artDescription || (creationMode !== "reference" && creationMode !== "from_scratch") ||
    (generationSide !== "left" && generationSide !== "right" && generationSide !== "both")) {
    throw new Error("invalid_studio_input");
  }

  const fileEntry = form.get("reference");
  let reference: ReferenceImage | null = null;
  if (fileEntry !== null && fileEntry !== "") {
    if (!(fileEntry instanceof File)) throw new Error("invalid_studio_input");
    if (
      fileEntry.size <= 0 ||
      fileEntry.size > MAX_REFERENCE_BYTES ||
      !["image/png", "image/jpeg", "image/webp"].includes(fileEntry.type)
    ) throw new Error("invalid_studio_input");
    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    if (detectImageMime(bytes) !== fileEntry.type) throw new Error("invalid_studio_input");
    reference = { bytes, fileName: fileEntry.name || "reference-image", mimeType: fileEntry.type };
  }

  if ((creationMode === "reference") !== Boolean(reference)) throw new Error("invalid_studio_input");

  const title = readText(form, "title", 100) || ("Caneca - " + artDescription.slice(0, 80));
  return {
    input: {
      title,
      creationMode,
      artDescription,
      generationSide,
      mandatoryText: readList(form, "mandatoryText"),
      occasion: readText(form, "occasion", 120),
      recipient: readText(form, "recipient", 120),
      mainTheme: legacyMainTheme || undefined,
      desiredStyle: readText(form, "desiredStyle", 200),
      colorPreferences: readList(form, "colorPreferences"),
      mandatoryElements: readList(form, "mandatoryElements"),
      forbiddenElements: readList(form, "forbiddenElements"),
      compositionNotes: readText(form, "compositionNotes", 1000),
    },
    reference,
  };
}

function serviceClients(): { url: string; adminClient: AdminClient } {
  const url = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  if (!url || !serviceRole) throw new Error("studio_access_unavailable");

  const adminClient = createClient<any, "public">(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { url, adminClient };
}

async function resolveOpenAiKey(adminClient: AdminClient): Promise<string> {
  const { data, error } = await adminClient.rpc("get_conversation_worker_provider_secret_v1");
  if (error) {
    console.error("[caneca-studio] existing OpenAI provider secret lookup failed");
    return "";
  }
  return typeof data === "string" ? data.trim() : "";
}

async function authorize(request: Request): Promise<{
  sessionId: string;
  adminClient: AdminClient;
  url: string;
} | Response> {
  const sessionId = request.headers.get("x-studio-session")?.trim() || "";
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return json({ error: "studio_session_required" }, 400);
  }

  let clients: ReturnType<typeof serviceClients>;
  try {
    clients = serviceClients();
  } catch {
    return json({ error: "studio_job_lookup_failed" }, 503);
  }

  return {
    sessionId,
    adminClient: clients.adminClient,
    url: clients.url,
  };
}

function safeExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function makeArtPrompt(input: StudioInput): string {
  const generationSide = input.pendingEdit?.side || input.generationSide || "both";
  const description = input.artDescription?.trim() || input.mainTheme?.trim() || "Arte decorativa personalizada para uma caneca.";
  const sideInstruction = input.pendingEdit && generationSide !== "both"
    ? generationSide === "left"
      ? "This is a revision of an existing wrap: change only the LEFT HALF (x=0 to 1199). Preserve the RIGHT HALF (x=1200 to 2399) exactly as it appears in the reference; do not blank, redraw, or shift it."
      : "This is a revision of an existing wrap: change only the RIGHT HALF (x=1200 to 2399). Preserve the LEFT HALF (x=0 to 1199) exactly as it appears in the reference; do not blank, redraw, or shift it."
    : generationSide === "left"
    ? "The requested new art belongs only on the LEFT HALF (x=0 to 1199). Keep the RIGHT HALF (x=1200 to 2399) completely plain white with no artwork, lettering, shadows, or decoration."
    : generationSide === "right"
    ? "The requested new art belongs only on the RIGHT HALF (x=1200 to 2399). Keep the LEFT HALF (x=0 to 1199) completely plain white with no artwork, lettering, shadows, or decoration."
    : "Create one continuous, balanced wrap design across both halves; the left half is x=0 to 1199 and the right half is x=1200 to 2399.";
  const lines = [
    "Create only the flat 2D artwork for printing as a wrap on a ceramic mug. Never draw a mug, product mockup, hands, table, or room.",
    "Final landscape canvas: " + ART_SIZE + " pixels; physical target approximately 24 x 9.5 cm.",
    "The center split is exactly x=1200 px: left-side artwork is the first half of the file; right-side artwork is the second half. Do not mirror or swap the halves.",
    "Keep important text and artwork comfortably inside the top and bottom print-safe area. Preserve the full canvas and do not stretch, crop, or compress the design.",
    sideInstruction,
    "Do not invent lettering, names, dates, or random text. Include only exact wording supplied below.",
    "Art description: " + description,
  ];
  if (input.occasion) lines.push("Occasion: " + input.occasion);
  if (input.recipient) lines.push("Made for: " + input.recipient);
  if (input.desiredStyle) lines.push("Visual style: " + input.desiredStyle);
  if (input.colorPreferences?.length) lines.push("Color palette: " + input.colorPreferences.join(", "));
  if (input.mandatoryText?.length) {
    lines.push("Required exact text, preserving accents, spelling, and punctuation: " +
      input.mandatoryText.map((item) => '"' + item + '"').join("; "));
  }
  if (input.mandatoryElements?.length) lines.push("Required visual elements: " + input.mandatoryElements.join("; "));
  if (input.forbiddenElements?.length) lines.push("Elements to avoid: " + input.forbiddenElements.join("; "));
  if (input.compositionNotes) lines.push("Composition notes: " + input.compositionNotes);
  if (input.latestEditInstruction) lines.push("Latest requested refinement: " + input.latestEditInstruction);
  if (input.pendingEdit) {
    const target = input.pendingEdit.side || generationSide;
    const targetLabel = target === "both" ? "the entire wrap" : "only the " + target + " half";
    lines.push("Operator edit request: " + input.pendingEdit.instruction + ". Change " + targetLabel +
      " only. Preserve the opposite half exactly as it appears in the reference artwork.");
  }
  lines.push("Create a polished, balanced proposal for human review before production. Do not add watermarks or unrelated lettering.");
  return lines.join("\n");
}

function makeMockupPrompt(side: Side): string {
  const sideDescription = side === "left"
    ? "Show one white ceramic mug with its handle clearly pointing to the LEFT side of the image. Print only the supplied LEFT-HALF artwork on the visible mug surface."
    : "Show one white ceramic mug with its handle clearly pointing to the RIGHT side of the image. Print only the supplied RIGHT-HALF artwork on the visible mug surface.";
  return [
    "Create a clean commercial product photograph of exactly one white ceramic mug using the supplied side-only artwork as its printed design.",
    "The supplied image is an exact crop of the corresponding side of the print file. Preserve its colors, text, symbols, and composition; do not redesign, mirror, flip, rotate, swap, or invent any part of it.",
    sideDescription,
    "Use soft natural studio lighting, a simple warm neutral background, and a realistic ceramic finish.",
    "Do not add extra logos, text, props that cover the mug, or additional mugs.",
  ].join(" ");
}

function manualReview(note: string): QualityReview {
  return {
    approved: false,
    score: 0,
    blocking_issues: [],
    warnings: ["A revisão automática não ficou disponível nesta tentativa."],
    exact_text_ok: null,
    brief_ok: false,
    edges_ok: false,
    recommendation: "manual_review",
    concise_note: note,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 300)).filter(Boolean).slice(0, 8);
}

function parseQualityReview(text: string): QualityReview {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const blocking = stringList(value.blocking_issues);
    const warnings = stringList(value.warnings);
    const score = typeof value.score === "number" && Number.isFinite(value.score)
      ? Math.max(0, Math.min(100, Math.round(value.score))) : 0;
    const recommendation = value.recommendation === "approve" || value.recommendation === "regenerate" ||
      value.recommendation === "manual_review" ? value.recommendation : "manual_review";
    const exactText = typeof value.exact_text_ok === "boolean" ? value.exact_text_ok : null;
    const briefOk = value.brief_ok === true;
    const edgesOk = value.edges_ok === true;
    const approved = value.approved === true && blocking.length === 0 &&
      exactText !== false && briefOk && edgesOk;
    return {
      approved,
      score,
      blocking_issues: blocking,
      warnings,
      exact_text_ok: exactText,
      brief_ok: briefOk,
      edges_ok: edgesOk,
      recommendation: approved ? "approve" : recommendation,
      concise_note: typeof value.concise_note === "string"
        ? value.concise_note.trim().slice(0, 500)
        : "Confira a arte manualmente antes de produzir.",
    };
  } catch {
    return manualReview("A revisão automática não retornou um resultado legível. Confira a arte manualmente.");
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function openAIImage(
  apiKey: string,
  prompt: string,
  size: string,
  image?: ReferenceImage,
): Promise<Uint8Array> {
  let response: Response;
  if (image) {
    const form = new FormData();
    form.set("model", IMAGE_MODEL);
    form.set("prompt", prompt);
    form.set("size", size);
    form.set("quality", "medium");
    form.set("output_format", "webp");
    form.set("background", "opaque");
    const imageCopy = new Uint8Array(image.bytes.byteLength);
    imageCopy.set(image.bytes);
    form.set("image", new File([imageCopy.buffer as ArrayBuffer], image.fileName, { type: image.mimeType }));
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: form,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        size,
        quality: "medium",
        output_format: "webp",
        background: "opaque",
        n: 1,
      }),
    });
  }

  const requestId = response.headers.get("x-request-id");
  const payload = await response.json().catch(() => ({})) as {
    data?: Array<{ b64_json?: string | null }>;
  };
  if (!response.ok) {
    console.error("[caneca-studio] image request failed", { status: response.status, requestId });
    throw new Error("studio_image_generation_failed");
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error("studio_image_generation_failed");
  return base64ToBytes(encoded);
}

async function reviewArtwork(apiKey: string, bytes: Uint8Array, input: StudioInput): Promise<QualityReview> {
  const reviewerPrompt = [
    "Você é o Quality Gate visual da CanecaFácil.",
    "Analise a arte gerada antes de mostrá-la à equipe. Seja rigoroso com erros objetivos, mas não reprove por preferência estética subjetiva.",
    "Compare a imagem com a descrição e com o texto exato quando houver. Verifique o formato horizontal para impressão, a correspondência do conteúdo com o lado solicitado, a divisão no centro e erros visuais evidentes.",
    "Não invente detalhes sobre a imagem. Se não conseguir verificar algo, marque como incerto e recomende revisão manual.",
    "Aprovação automática só quando brief_ok e edges_ok forem true, exact_text_ok não for false, e não houver blocking_issues.",
    "Retorne apenas JSON válido com: approved (boolean), score (0-100), blocking_issues (array), warnings (array), exact_text_ok (boolean|null), brief_ok (boolean), edges_ok (boolean), recommendation (approve|regenerate|manual_review), concise_note (string).",
  ].join(" ");
  const expectedBrief = {
    title: input.title,
    description: input.artDescription || input.mainTheme || null,
    requested_side: input.generationSide || "both",
    exact_text: input.mandatoryText || [],
    latest_edit_instruction: input.latestEditInstruction || null,
    canvas: ART_SIZE,
    reference_image_supplied: input.creationMode === "reference",
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: REVIEW_MODEL,
        store: false,
        max_output_tokens: 1200,
        text: { format: { type: "json_object" } },
        input: [
          { role: "developer", content: reviewerPrompt },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "BRIEFING ESPERADO (JSON):\n" + JSON.stringify(expectedBrief) +
                  "\n\nA imagem anexada é a arte final a revisar.",
              },
              {
                type: "input_image",
                image_url: "data:image/webp;base64," + bytesToBase64(bytes),
                detail: "high",
              },
            ],
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({})) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    if (!response.ok) {
      console.error("[caneca-studio] quality review failed", {
        status: response.status,
        requestId: response.headers.get("x-request-id"),
      });
      return manualReview("Não foi possível concluir a revisão automática. Confira a arte manualmente.");
    }
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text || "";
    return parseQualityReview(outputText);
  } catch {
    return manualReview("Não foi possível concluir a revisão automática. Confira a arte manualmente.");
  }
}

function normalizeSignedUrl(projectUrl: string, signedUrl: string): string {
  return signedUrl.startsWith("http") ? signedUrl : projectUrl + "/storage/v1" + signedUrl;
}

function latestArt(job: JobRow): ArtVersion | null {
  const versions = Array.isArray(job.art_versions) ? job.art_versions : [];
  return versions.length ? versions[versions.length - 1] : null;
}

async function downloadPrivate(adminClient: AdminClient, path: string): Promise<Uint8Array> {
  const { data, error } = await adminClient.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("studio_asset_lookup_failed");
  return new Uint8Array(await data.arrayBuffer());
}

async function uploadPrivate(
  adminClient: AdminClient,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const { error } = await adminClient.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error("studio_asset_upload_failed");
}

async function writeJob(
  adminClient: AdminClient,
  jobId: string,
  sessionId: string,
  patch: Record<string, unknown>,
  expectedUpdatedAt?: string,
): Promise<JobRow> {
  let query = adminClient.from(TABLE)
    .update({ ...patch, processing: false, processing_started_at: null, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("guest_session_id", sessionId)
    .is("created_by", null);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) throw new Error("studio_job_lookup_failed");
  return data as JobRow;
}

async function jobSnapshot(
  adminClient: AdminClient,
  url: string,
  job: JobRow | null,
): Promise<Record<string, unknown> | null> {
  if (!job) return null;
  const artVersion = latestArt(job);
  const artVersions = await Promise.all((Array.isArray(job.art_versions) ? job.art_versions : []).map(async (version) => {
    const { data, error } = await adminClient.storage.from(BUCKET)
      .createSignedUrl(version.path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) throw new Error("studio_job_lookup_failed");
    return {
      version: version.version,
      source: version.source || "initial",
      parentVersion: version.parentVersion ?? null,
      instruction: version.instruction ?? null,
      createdAt: version.createdAt ?? null,
      generationSide: version.generationSide || job.input?.generationSide || "both",
      url: normalizeSignedUrl(url, data.signedUrl),
    };
  }));
  const signedLatest = artVersion ? artVersions.find((version) => version.version === artVersion.version) : null;
  const art = signedLatest ? { version: signedLatest.version, url: signedLatest.url } : null;
  const mockups = await Promise.all((Array.isArray(job.mockups) ? job.mockups : []).map(async (asset) => {
    const { data, error } = await adminClient.storage.from(BUCKET)
      .createSignedUrl(asset.path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) throw new Error("studio_job_lookup_failed");
    const side = asset.side === "left" || asset.side === "front" ? "left" : "right";
    return { version: asset.version, side, url: normalizeSignedUrl(url, data.signedUrl) };
  }));
  return {
    projectId: job.id,
    title: job.title,
    status: job.status,
    generationSide: job.input?.generationSide || "both",
    processing: job.processing,
    art,
    artVersions,
    validation: job.validation,
    mockups,
    printing: job.input?.printing || emptyPrintState(),
    printHistory: Array.isArray(job.input?.printHistory) ? job.input.printHistory : [],
    createdAt: job.created_at,
  };
}

async function getJob(
  adminClient: AdminClient,
  jobId: string,
  sessionId: string,
): Promise<JobRow | null> {
  const { data, error } = await adminClient.from(TABLE).select("*")
    .eq("id", jobId)
    .eq("guest_session_id", sessionId)
    .is("created_by", null)
    .maybeSingle();
  if (error) throw new Error("studio_job_lookup_failed");
  return data as JobRow | null;
}

async function startJob(
  adminClient: AdminClient,
  url: string,
  sessionId: string,
  form: FormData,
): Promise<Response> {
  const { input, reference } = await parseInput(form);
  const { data, error } = await adminClient.from(TABLE).insert({
    created_by: null,
    guest_session_id: sessionId,
    title: input.title,
    creation_mode: input.creationMode,
    input,
    status: "art_pending",
    reference_path: null,
  }).select("*").single();
  if (error || !data) {
    console.error("[caneca-studio] job insert failed");
    return json({ error: "studio_job_start_failed" }, 500);
  }
  let job = data as JobRow;

  if (reference) {
    const path = job.id + "/reference." + safeExtension(reference.mimeType);
    const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, reference.bytes, {
      contentType: reference.mimeType,
      upsert: false,
    });
    if (uploadError) {
      await adminClient.from(TABLE).update({
        status: "failed",
        error_code: "studio_reference_upload_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      return json({ error: "studio_job_start_failed" }, 500);
    }
    const { data: updated, error: updateError } = await adminClient.from(TABLE)
      .update({ reference_path: path, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single();
    if (updateError || !updated) return json({ error: "studio_job_start_failed" }, 500);
    job = updated as JobRow;
  }

  const snapshot = await jobSnapshot(adminClient, url, job);
  return json(snapshot, 202);
}

async function advanceJob(
  adminClient: AdminClient,
  url: string,
  sessionId: string,
  jobId: string,
): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return json({ error: "studio_job_not_found" }, 404);
  }
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await adminClient.from(TABLE)
    .update({ processing: true, processing_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("guest_session_id", sessionId)
    .is("created_by", null)
    .or("processing.eq.false,processing_started_at.lt." + staleBefore)
    .select("*")
    .maybeSingle();

  if (claimError) return json({ error: "studio_job_lookup_failed" }, 500);
  if (!claimed) {
    const current = await getJob(adminClient, jobId, sessionId);
    if (!current) return json({ error: "studio_job_not_found" }, 404);
    return json(await jobSnapshot(adminClient, url, current));
  }

  const job = claimed as JobRow;
  if (job.status === "needs_review" || job.status === "failed") {
    return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, sessionId, {
      status: job.status,
      processing: false,
    })));
  }

  const apiKey = await resolveOpenAiKey(adminClient);
  if (!apiKey) {
    try {
      await writeJob(adminClient, job.id, sessionId, { status: job.status, error_code: "openai_provider_secret_unavailable" });
    } catch { /* The next request can reclaim a stale processing claim. */ }
    return json({ error: "openai_provider_secret_unavailable" }, 503);
  }

  try {
    if (job.status === "art_pending") {
      const imagePrompt = makeArtPrompt(job.input);
      let reference: ReferenceImage | undefined;
      if (job.reference_path) {
        reference = {
          bytes: await downloadPrivate(adminClient, job.reference_path),
          fileName: "reference." + job.reference_path.split(".").pop(),
          mimeType: job.reference_path.endsWith(".jpg") ? "image/jpeg"
            : job.reference_path.endsWith(".webp") ? "image/webp" : "image/png",
        };
      }
      const bytes = await openAIImage(apiKey, imagePrompt, ART_SIZE, reference);
      const path = job.id + "/art-v1.webp";
      await uploadPrivate(adminClient, path, bytes, "image/webp");
      return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, sessionId, {
        status: "review_pending",
        art_versions: [{
          version: 1,
          path,
          source: "initial",
          parentVersion: null,
          createdAt: new Date().toISOString(),
          generationSide: job.input?.generationSide || "both",
        }],
        error_code: null,
      })));
    }

    if (job.status === "review_pending") {
      const art = latestArt(job);
      if (!art) throw new Error("studio_art_missing");
      const bytes = await downloadPrivate(adminClient, art.path);
      const validation = await reviewArtwork(apiKey, bytes, job.input);
      const shouldCorrect = !validation.approved &&
        validation.recommendation === "regenerate" &&
        job.correction_count < 1;
      return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, sessionId, {
        validation,
        status: shouldCorrect ? "correction_pending" : "needs_review",
        error_code: null,
      })));
    }

    if (job.status === "correction_pending") {
      const versions = Array.isArray(job.art_versions) ? job.art_versions : [];
      const nextVersion = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1;
      const pendingEdit = job.input?.pendingEdit;
      if (pendingEdit) {
        const base = versions.find((item) => item.version === pendingEdit.baseVersion);
        if (!base) throw new Error("studio_art_missing");
        const previous = await downloadPrivate(adminClient, base.path);
        const prompt = makeArtPrompt(job.input) +
          "\nApply only the requested change. Keep all other artwork, spelling, proportions, and placement from the reference unchanged.";
        const bytes = await openAIImage(apiKey, prompt, ART_SIZE, {
          bytes: previous,
          fileName: "caneca-facil-arte-v" + base.version + ".webp",
          mimeType: "image/webp",
        });
        const path = job.id + "/art-v" + nextVersion + ".webp";
        await uploadPrivate(adminClient, path, bytes, "image/webp");
        const nextInput = { ...job.input, pendingEdit: null };
        const nextVersions = [...versions, {
          version: nextVersion,
          path,
          source: "operator_edit",
          parentVersion: base.version,
          instruction: pendingEdit.instruction,
          createdAt: new Date().toISOString(),
          generationSide: pendingEdit.side || job.input?.generationSide || "both",
        }];
        return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, sessionId, {
          input: nextInput,
          art_versions: nextVersions,
          validation: null,
          status: "review_pending",
          error_code: null,
        })));
      }

      const art = latestArt(job);
      if (!art) throw new Error("studio_art_missing");
      const previous = await downloadPrivate(adminClient, art.path);
      const validation = job.validation;
      const corrections = validation?.blocking_issues?.length
        ? validation.blocking_issues.join("; ")
        : validation?.concise_note || "Corrija os problemas visuais objetivos indicados.";
      const prompt = makeArtPrompt(job.input) +
        "\n\nCORREÇÕES DO QUALITY GATE: corrija estes pontos objetivos sem alterar os demais requisitos: " +
        corrections;
      const bytes = await openAIImage(apiKey, prompt, ART_SIZE, {
        bytes: previous,
        fileName: "caneca-facil-arte-v" + art.version + ".webp",
        mimeType: "image/webp",
      });
      const path = job.id + "/art-v" + nextVersion + ".webp";
      await uploadPrivate(adminClient, path, bytes, "image/webp");
      const nextVersions = [...versions, {
        version: nextVersion,
        path,
        source: "quality_gate",
        parentVersion: art.version,
        instruction: corrections,
        createdAt: new Date().toISOString(),
        generationSide: job.input?.generationSide || "both",
      }];
      return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, sessionId, {
        art_versions: nextVersions,
        correction_count: Math.min(1, job.correction_count + 1),
        status: "review_pending",
        error_code: null,
      })));
    }

    if (["mockup_left_pending", "mockup_right_pending", "mockup_front_pending", "mockup_back_pending"].includes(job.status)) {
      const side: Side = job.status === "mockup_left_pending" || job.status === "mockup_front_pending" ? "left" : "right";
      const targetVersion = job.input?.mockupTargetVersion;
      const art = (Array.isArray(job.art_versions) ? job.art_versions : [])
        .find((item) => item.version === targetVersion) || latestArt(job);
      if (!art) throw new Error("studio_art_missing");
      const references = job.input?.mockupReferencePaths;
      const referencePath = references?.version === targetVersion
        ? side === "left" ? references.leftPath : references.rightPath
        : art.path;
      const referenceBytes = await downloadPrivate(adminClient, referencePath);
      const referenceMime = referencePath.endsWith(".png") ? "image/png"
        : referencePath.endsWith(".jpg") || referencePath.endsWith(".jpeg") ? "image/jpeg" : "image/webp";
      const bytes = await openAIImage(apiKey, makeMockupPrompt(side), "1024x1024", {
        bytes: referenceBytes,
        fileName: "caneca-referencia-lado-" + side + "." + safeExtension(referenceMime),
        mimeType: referenceMime,
      });
      const version = art.version;
      const path = job.id + "/mockup-v" + version + "-" + side + "-" + Date.now() + ".webp";
      await uploadPrivate(adminClient, path, bytes, "image/webp");
      const mockups = [...(Array.isArray(job.mockups) ? job.mockups : []), { version, side, path }];
      const isLast = side === "right";
      const nextInput = isLast
        ? { ...job.input, mockupTargetVersion: null, mockupReferencePaths: null }
        : job.input;
      const updated = await writeJob(adminClient, job.id, sessionId, {
        mockups,
        status: isLast ? "needs_review" : "mockup_right_pending",
        input: nextInput,
        error_code: null,
      });
      if (isLast && references?.version === targetVersion) {
        await adminClient.storage.from(BUCKET).remove([references.leftPath, references.rightPath]);
      }
      return json(await jobSnapshot(adminClient, url, updated));
    }

    throw new Error("studio_job_step_failed");
  } catch {
    console.error("[caneca-studio] generation step failed", { jobId: job.id, status: job.status });
    try {
      const failed = await writeJob(adminClient, job.id, sessionId, {
        status: "failed",
        error_code: "studio_job_step_failed",
      });
      const references = job.input?.mockupReferencePaths;
      if (references) await adminClient.storage.from(BUCKET).remove([references.leftPath, references.rightPath]);
      return json(await jobSnapshot(adminClient, url, failed));
    } catch {
      return json({ error: "studio_job_step_failed" }, 500);
    }
  }
}

type PublicRateDecision = "allowed" | "limited" | "unavailable";

async function checkPublicStartLimit(
  adminClient: AdminClient,
  request: Request,
): Promise<PublicRateDecision> {
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (!clientIp) return "unavailable";

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
    const ipHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const { data, error } = await adminClient.rpc("consume_caneca_studio_public_limit_v1", {
      p_client_ip_hash: ipHash,
      p_limit: PUBLIC_START_LIMIT,
    });
    if (error) {
      console.error("[caneca-studio] public rate-limit check failed");
      return "unavailable";
    }
    return data === true ? "allowed" : "limited";
  } catch {
    console.error("[caneca-studio] public rate-limit check failed");
    return "unavailable";
  }
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== PUBLIC_APP_ORIGIN) {
    return json({ error: "studio_origin_not_allowed" }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = await authorize(request);
  if (authorization instanceof Response) return authorization;
  const { sessionId, adminClient, url } = authorization;

  const contentType = request.headers.get("content-type") || "";
  let action: string | null = null;
  let form: FormData | null = null;
  let body: Record<string, unknown> = {};
  try {
    if (contentType.includes("multipart/form-data")) {
      form = await request.formData();
      action = typeof form.get("action") === "string" ? String(form.get("action")) : null;
    } else {
      body = await request.json() as Record<string, unknown>;
      action = typeof body.action === "string" ? body.action : null;
    }
  } catch {
    return json({ error: "invalid_studio_input" }, 400);
  }

  if (action === "latest") {
    const { data, error } = await adminClient.from(TABLE).select("*")
      .eq("guest_session_id", sessionId)
      .is("created_by", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: "studio_job_lookup_failed" }, 500);
    const snapshot = await jobSnapshot(adminClient, url, data as JobRow | null);
    return json({ job: snapshot });
  }

  if (action === "history") {
    const { data, error } = await adminClient.from(TABLE)
      .select("id,title,status,created_at,updated_at,art_versions")
      .eq("guest_session_id", sessionId)
      .is("created_by", null)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) return json({ error: "studio_job_lookup_failed" }, 500);
    const jobs = (data || []).map((row) => {
      const versions = Array.isArray(row.art_versions) ? row.art_versions as ArtVersion[] : [];
      return {
        projectId: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        latestVersion: versions.at(-1)?.version || null,
      };
    });
    return json({ jobs });
  }

  if (action === "load") {
    if (!isValidJobId(body.jobId)) return json({ error: "studio_job_not_found" }, 404);
    const job = await getJob(adminClient, body.jobId, sessionId);
    if (!job) return json({ error: "studio_job_not_found" }, 404);
    return json(await jobSnapshot(adminClient, url, job));
  }

  if (action === "start") {
    if (!form) return json({ error: "invalid_studio_input" }, 400);
    const rateDecision = await checkPublicStartLimit(adminClient, request);
    if (rateDecision === "limited") return json({ error: "studio_rate_limited" }, 429);
    if (rateDecision === "unavailable") return json({ error: "studio_rate_limit_unavailable" }, 503);
    try {
      return await startJob(adminClient, url, sessionId, form);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_studio_input") {
        return json({ error: "invalid_studio_input" }, 400);
      }
      console.error("[caneca-studio] could not start job");
      return json({ error: "studio_job_start_failed" }, 500);
    }
  }

  if (action === "upload_art") {
    if (!form) return json({ error: "invalid_studio_input" }, 400);
    const jobId = readActionText(form, "jobId", 36) || "";
    const version = Number(readActionText(form, "version", 12) || "");
    const sideValue = readActionText(form, "side", 8);
    if (!isValidJobId(jobId) || !Number.isInteger(version) || version < 1 ||
      (sideValue !== "left" && sideValue !== "right")) {
      return json({ error: "invalid_studio_input" }, 400);
    }

    let artwork: ReferenceImage;
    try {
      artwork = await readUploadedImage(form, "artwork", 2400, 960);
    } catch {
      return json({ error: "invalid_studio_input" }, 400);
    }

    const job = await getJob(adminClient, jobId, sessionId);
    if (!job) return json({ error: "studio_job_not_found" }, 404);
    const versions = Array.isArray(job.art_versions) ? job.art_versions : [];
    const base = versions.find((item) => item.version === version);
    if (!base || job.status !== "needs_review" || job.processing) {
      return json({ error: "studio_job_conflict" }, 409);
    }

    const nextVersion = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const path = job.id + "/art-v" + nextVersion + "-" + crypto.randomUUID() + ".webp";
    let updated: JobRow;
    try {
      await uploadPrivate(adminClient, path, artwork.bytes, artwork.mimeType);
      const side = sideValue as Side;
      const nextInput = archivePrintState(job.input);
      nextInput.generationSide = side;
      nextInput.pendingEdit = null;
      nextInput.latestEditInstruction = null;
      nextInput.mockupTargetVersion = null;
      nextInput.mockupReferencePaths = null;
      const nextVersions = [...versions, {
        version: nextVersion,
        path,
        source: "operator_upload" as const,
        parentVersion: base.version,
        instruction: "Arte pronta enviada para o lado " + side + ".",
        createdAt: new Date().toISOString(),
        generationSide: side,
      }];
      updated = await writeJob(adminClient, job.id, sessionId, {
        input: nextInput,
        art_versions: nextVersions,
        validation: null,
        mockups: [],
        status: "needs_review",
        error_code: null,
      }, job.updated_at);
    } catch {
      await adminClient.storage.from(BUCKET).remove([path]);
      return json({ error: "studio_job_conflict" }, 409);
    }
    const oldMockups = (Array.isArray(job.mockups) ? job.mockups : []).map((asset) => asset.path);
    const oldReferences = job.input.mockupReferencePaths;
    const removePaths = [
      ...oldMockups,
      ...(oldReferences ? [oldReferences.leftPath, oldReferences.rightPath] : []),
    ];
    if (removePaths.length) await adminClient.storage.from(BUCKET).remove(removePaths);
    return json(await jobSnapshot(adminClient, url, updated));
  }

  if (action === "edit") {
    if (!isValidJobId(body.jobId)) return json({ error: "studio_job_not_found" }, 404);
    const version = Number(body.version);
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    const side = body.side === undefined ? "both" : body.side;
    if (!Number.isInteger(version) || version < 1 || instruction.length < 3 || instruction.length > 800) {
      return json({ error: "invalid_studio_input" }, 400);
    }
    if (side !== "left" && side !== "right" && side !== "both") {
      return json({ error: "invalid_studio_input" }, 400);
    }
    const job = await getJob(adminClient, body.jobId, sessionId);
    if (!job) return json({ error: "studio_job_not_found" }, 404);
    const versions = Array.isArray(job.art_versions) ? job.art_versions : [];
    if (!versions.some((item) => item.version === version) || job.status !== "needs_review" || job.processing) {
      return json({ error: "studio_job_conflict" }, 409);
    }
    const rateDecision = await checkPublicStartLimit(adminClient, request);
    if (rateDecision === "limited") return json({ error: "studio_rate_limited" }, 429);
    if (rateDecision === "unavailable") return json({ error: "studio_rate_limit_unavailable" }, 503);

    try {
      const nextInput = archivePrintState(job.input);
      nextInput.generationSide = side as GenerationSide;
      nextInput.pendingEdit = { baseVersion: version, instruction, side: side as GenerationSide };
      nextInput.latestEditInstruction = instruction;
      const updated = await writeJob(adminClient, job.id, sessionId, {
        input: nextInput,
        validation: null,
        mockups: [],
        status: "correction_pending",
        error_code: null,
      }, job.updated_at);
      const oldMockups = Array.isArray(job.mockups) ? job.mockups.map((asset) => asset.path) : [];
      if (oldMockups.length) await adminClient.storage.from(BUCKET).remove(oldMockups);
      return json(await jobSnapshot(adminClient, url, updated), 202);
    } catch {
      return json({ error: "studio_job_conflict" }, 409);
    }
  }

  if (action === "mockups") {
    if (!form) return json({ error: "invalid_studio_input" }, 400);
    const jobId = readActionText(form, "jobId", 36) || "";
    const version = Number(readActionText(form, "version", 12) || "");
    if (!isValidJobId(jobId) || !Number.isInteger(version) || version < 1) {
      return json({ error: "invalid_studio_input" }, 400);
    }
    let leftReference: ReferenceImage;
    let rightReference: ReferenceImage;
    try {
      leftReference = await readUploadedImage(form, "leftReference", 1200, 960);
      rightReference = await readUploadedImage(form, "rightReference", 1200, 960);
    } catch {
      return json({ error: "invalid_studio_input" }, 400);
    }
    const job = await getJob(adminClient, jobId, sessionId);
    if (!job) return json({ error: "studio_job_not_found" }, 404);
    const versions = Array.isArray(job.art_versions) ? job.art_versions : [];
    if (!Number.isInteger(version) || !versions.some((item) => item.version === version) ||
      job.status !== "needs_review" || job.processing) return json({ error: "studio_job_conflict" }, 409);
    const rateDecision = await checkPublicStartLimit(adminClient, request);
    if (rateDecision === "limited") return json({ error: "studio_rate_limited" }, 429);
    if (rateDecision === "unavailable") return json({ error: "studio_rate_limit_unavailable" }, 503);

    const stamp = Date.now() + "-" + crypto.randomUUID();
    const leftPath = job.id + "/mockup-reference-v" + version + "-left-" + stamp + ".webp";
    const rightPath = job.id + "/mockup-reference-v" + version + "-right-" + stamp + ".webp";
    let leftUploaded = false;
    let updated: JobRow;
    try {
      await uploadPrivate(adminClient, leftPath, leftReference.bytes, leftReference.mimeType);
      leftUploaded = true;
      await uploadPrivate(adminClient, rightPath, rightReference.bytes, rightReference.mimeType);
      const removed = (Array.isArray(job.mockups) ? job.mockups : [])
        .filter((asset) => asset.version === version).map((asset) => asset.path);
      const previousReferences = job.input.mockupReferencePaths;
      updated = await writeJob(adminClient, job.id, sessionId, {
        input: {
          ...job.input,
          mockupTargetVersion: version,
          mockupReferencePaths: { version, leftPath, rightPath },
        },
        mockups: (Array.isArray(job.mockups) ? job.mockups : []).filter((asset) => asset.version !== version),
        status: "mockup_left_pending",
        error_code: null,
      }, job.updated_at);
      if (removed.length) await adminClient.storage.from(BUCKET).remove(removed);
      if (previousReferences) {
        await adminClient.storage.from(BUCKET).remove([previousReferences.leftPath, previousReferences.rightPath]);
      }
    } catch {
      await adminClient.storage.from(BUCKET).remove(leftUploaded ? [leftPath, rightPath] : [leftPath]);
      return json({ error: "studio_job_conflict" }, 409);
    }
    return json(await jobSnapshot(adminClient, url, updated), 202);
  }

  if (action === "approve") {
    if (!isValidJobId(body.jobId)) return json({ error: "studio_job_not_found" }, 404);
    const version = Number(body.version);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(version) || version < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return json({ error: "invalid_studio_input" }, 400);
    }
    const job = await getJob(adminClient, body.jobId, sessionId);
    if (!job) return json({ error: "studio_job_not_found" }, 404);
    const versions = Array.isArray(job.art_versions) ? job.art_versions : [];
    if (!versions.some((item) => item.version === version) || job.status !== "needs_review" || job.processing) {
      return json({ error: "studio_job_conflict" }, 409);
    }
    const nextInput = archivePrintState(job.input);
    nextInput.printing = {
      approvedVersion: version,
      quantity,
      completed: 0,
      status: "ready",
      approvedAt: new Date().toISOString(),
      reprints: [],
    };
    try {
      const updated = await writeJob(adminClient, job.id, sessionId, { input: nextInput }, job.updated_at);
      return json(await jobSnapshot(adminClient, url, updated));
    } catch {
      return json({ error: "studio_job_conflict" }, 409);
    }
  }

  if (action === "record_print") {
    if (!isValidJobId(body.jobId)) return json({ error: "studio_job_not_found" }, 404);
    const reprint = body.reprint === true;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reprint && (reason.length < 3 || reason.length > 300)) return json({ error: "invalid_studio_input" }, 400);
    const job = await getJob(adminClient, body.jobId, sessionId);
    if (!job) return json({ error: "studio_job_not_found" }, 404);
    const printing = printState(job.input);
    if (job.status !== "needs_review" || job.processing || printing.approvedVersion === null ||
      !Array.isArray(job.art_versions) || !job.art_versions.some((item) => item.version === printing.approvedVersion)) {
      return json({ error: "studio_print_not_approved" }, 409);
    }
    if (!reprint && (printing.status !== "ready" || printing.completed >= printing.quantity)) {
      return json({ error: "studio_print_quantity_complete" }, 409);
    }
    const nextPrinting: PrintState = reprint
      ? { ...printing, reprints: [...printing.reprints, { version: printing.approvedVersion, reason, createdAt: new Date().toISOString() }] }
      : {
        ...printing,
        completed: printing.completed + 1,
        status: printing.completed + 1 >= printing.quantity ? "printed" : "ready",
      };
    try {
      const updated = await writeJob(adminClient, job.id, sessionId, {
        input: { ...job.input, printing: nextPrinting },
      }, job.updated_at);
      return json(await jobSnapshot(adminClient, url, updated));
    } catch {
      return json({ error: "studio_job_conflict" }, 409);
    }
  }

  if (action === "advance") {
    if (!isValidJobId(body.jobId)) return json({ error: "studio_job_not_found" }, 404);
    return await advanceJob(adminClient, url, sessionId, body.jobId);
  }

  return json({ error: "invalid_studio_input" }, 400);
}

Deno.serve(handleRequest);
