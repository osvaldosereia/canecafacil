import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "@supabase/supabase-js/cors";

const TABLE = "caneca_studio_jobs";
const BUCKET = "caneca-studio-assets";
const IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-2.5-sunburst";
const REVIEW_MODEL = Deno.env.get("OPENAI_REVIEW_MODEL")?.trim() || "gpt-6-astra";
const ART_SIZE = "2400x960";
const SIGNED_URL_TTL = 900;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

type CreationMode = "reference" | "from_scratch";
type Side = "front" | "back";
type StudioInput = {
  title: string;
  creationMode: CreationMode;
  occasion: string | null;
  recipient: string | null;
  mainTheme: string;
  desiredStyle: string | null;
  colorPreferences: string[];
  mandatoryText: string[];
  mandatoryElements: string[];
  forbiddenElements: string[];
  compositionNotes: string | null;
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
type ArtVersion = { version: number; path: string };
type MockupAsset = { version: number; side: Side; path: string };
type JobRow = {
  id: string;
  created_by: string;
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
};

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

async function parseInput(form: FormData): Promise<{ input: StudioInput; reference: ReferenceImage | null }> {
  const creationMode = readText(form, "creationMode", 20, true);
  const mainTheme = readText(form, "mainTheme", 500, true);
  if (!mainTheme || (creationMode !== "reference" && creationMode !== "from_scratch")) {
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

  const title = readText(form, "title", 100) || ("Caneca - " + mainTheme.slice(0, 80));
  return {
    input: {
      title,
      creationMode,
      occasion: readText(form, "occasion", 120),
      recipient: readText(form, "recipient", 120),
      mainTheme,
      desiredStyle: readText(form, "desiredStyle", 200),
      colorPreferences: readList(form, "colorPreferences"),
      mandatoryText: readList(form, "mandatoryText"),
      mandatoryElements: readList(form, "mandatoryElements"),
      forbiddenElements: readList(form, "forbiddenElements"),
      compositionNotes: readText(form, "compositionNotes", 1000),
    },
    reference,
  };
}

function serviceClients() {
  const url = Deno.env.get("SUPABASE_URL")?.trim() || "";
  let publishable = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || "";
  if (!publishable) {
    try {
      publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || "";
    } catch {}
  }
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  if (!url || !publishable || !serviceRole) throw new Error("admin_access_unavailable");

  const authClient = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { url, authClient, adminClient };
}

async function authorize(request: Request): Promise<{ user: { id: string; email?: string }; adminClient: ReturnType<typeof createClient>; url: string } | Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "admin_auth_required" }, 401);

  let clients: ReturnType<typeof serviceClients>;
  try {
    clients = serviceClients();
  } catch {
    return json({ error: "admin_access_unavailable" }, 503);
  }
  const { data, error } = await clients.authClient.auth.getUser(token);
  if (error || !data.user) return json({ error: "admin_auth_required" }, 401);

  const configured = Deno.env.get("STUDIO_ADMIN_EMAILS")?.trim() || "";
  if (!configured) return json({ error: "admin_access_unavailable" }, 503);
  const allowed = configured.split(/[,;\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const email = data.user.email?.trim().toLowerCase() || "";
  if (!email || !allowed.includes(email)) return json({ error: "admin_access_required" }, 403);

  return { user: { id: data.user.id, email: data.user.email || undefined }, adminClient: clients.adminClient, url: clients.url };
}

function safeExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function makeArtPrompt(input: StudioInput): string {
  const lines = [
    "Create only the flat 2D artwork for printing as a wrap on a ceramic mug. Never draw a mug, product mockup, hands, table, or room.",
    "Final landscape canvas: " + ART_SIZE + " pixels; physical target approximately 24 x 9.5 cm.",
    "Let the artwork fill the usable height, with small safe margins above and below. Do not squash, stretch, or compress the main design into a low narrow band.",
    "Keep faces, people, animals, required text, and important symbols comfortably inside the upper and lower edges. Backgrounds, patterns, and natural bleed may continue to the canvas edges.",
    "Do not invent lettering, names, dates, or random text. Include only exact wording supplied in the briefing.",
    "Theme: " + input.mainTheme,
  ];
  if (input.occasion) lines.push("Occasion: " + input.occasion);
  if (input.recipient) lines.push("Made for: " + input.recipient);
  if (input.desiredStyle) lines.push("Visual style: " + input.desiredStyle);
  if (input.colorPreferences.length) lines.push("Color palette: " + input.colorPreferences.join(", "));
  if (input.mandatoryText.length) {
    lines.push("Required exact text, preserving accents, spelling, and punctuation: " +
      input.mandatoryText.map((item) => '"' + item + '"').join("; "));
  }
  if (input.mandatoryElements.length) lines.push("Required visual elements: " + input.mandatoryElements.join("; "));
  if (input.forbiddenElements.length) lines.push("Elements to avoid: " + input.forbiddenElements.join("; "));
  if (input.compositionNotes) lines.push("Composition notes: " + input.compositionNotes);
  lines.push("Create a polished, balanced proposal for human review before production. Do not add watermarks or unrelated lettering.");
  return lines.join("\n");
}

function makeMockupPrompt(side: Side, input: StudioInput): string {
  const sideDescription = side === "front"
    ? "Show the main front face of one classic white ceramic mug."
    : "Show the opposite side of the same classic white ceramic mug, with the artwork visible around the curve.";
  return [
    "Create a clean commercial product photograph of one white ceramic mug using the supplied flat artwork as its printed wrap.",
    "Preserve the supplied artwork colors, text, and visual composition as closely as possible.",
    sideDescription,
    "Use soft natural studio lighting, a simple warm neutral background, and a realistic ceramic finish.",
    "Do not add extra logos, text, props that cover the mug, or additional mugs.",
    "Theme brief: " + input.mainTheme,
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
    form.set("image", new File([image.bytes], image.fileName, { type: image.mimeType }));
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
    "Compare a imagem com o briefing e com os textos exatos exigidos. Verifique: texto/nome exato quando exigido; presença dos elementos essenciais; cortes problemáticos nas laterais; composição utilizável como arte horizontal de caneca; erros visuais evidentes; aderência ao estilo e à paleta.",
    "Não invente detalhes sobre a imagem. Se não conseguir verificar algo, marque como incerto e recomende revisão manual.",
    "Aprovação automática só quando brief_ok e edges_ok forem true, exact_text_ok não for false, e não houver blocking_issues.",
    "Retorne apenas JSON válido com: approved (boolean), score (0-100), blocking_issues (array), warnings (array), exact_text_ok (boolean|null), brief_ok (boolean), edges_ok (boolean), recommendation (approve|regenerate|manual_review), concise_note (string).",
  ].join(" ");
  const expectedBrief = {
    title: input.title,
    occasion: input.occasion,
    recipient: input.recipient,
    theme: input.mainTheme,
    style: input.desiredStyle,
    colors: input.colorPreferences,
    exact_text: input.mandatoryText,
    required_elements: input.mandatoryElements,
    forbidden_elements: input.forbiddenElements,
    composition_notes: input.compositionNotes,
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

async function downloadPrivate(adminClient: ReturnType<typeof createClient>, path: string): Promise<Uint8Array> {
  const { data, error } = await adminClient.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("studio_asset_lookup_failed");
  return new Uint8Array(await data.arrayBuffer());
}

async function uploadPrivate(
  adminClient: ReturnType<typeof createClient>,
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
  adminClient: ReturnType<typeof createClient>,
  jobId: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<JobRow> {
  const { data, error } = await adminClient.from(TABLE)
    .update({ ...patch, processing: false, processing_started_at: null, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("created_by", userId)
    .select("*")
    .single();
  if (error || !data) throw new Error("studio_job_lookup_failed");
  return data as JobRow;
}

async function jobSnapshot(
  adminClient: ReturnType<typeof createClient>,
  url: string,
  job: JobRow | null,
): Promise<Record<string, unknown> | null> {
  if (!job) return null;
  const artVersion = latestArt(job);
  let art: { version: number; url: string } | null = null;
  if (artVersion) {
    const { data, error } = await adminClient.storage.from(BUCKET)
      .createSignedUrl(artVersion.path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) throw new Error("studio_job_lookup_failed");
    art = { version: artVersion.version, url: normalizeSignedUrl(url, data.signedUrl) };
  }
  const mockups = await Promise.all((Array.isArray(job.mockups) ? job.mockups : []).map(async (asset) => {
    const { data, error } = await adminClient.storage.from(BUCKET)
      .createSignedUrl(asset.path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) throw new Error("studio_job_lookup_failed");
    return { version: asset.version, url: normalizeSignedUrl(url, data.signedUrl) };
  }));
  return {
    projectId: job.id,
    title: job.title,
    status: job.status,
    processing: job.processing,
    art,
    validation: job.validation,
    mockups,
  };
}

async function getJob(
  adminClient: ReturnType<typeof createClient>,
  jobId: string,
  userId: string,
): Promise<JobRow | null> {
  const { data, error } = await adminClient.from(TABLE).select("*")
    .eq("id", jobId)
    .eq("created_by", userId)
    .maybeSingle();
  if (error) throw new Error("studio_job_lookup_failed");
  return data as JobRow | null;
}

async function startJob(
  adminClient: ReturnType<typeof createClient>,
  url: string,
  userId: string,
  form: FormData,
): Promise<Response> {
  const { input, reference } = await parseInput(form);
  const { data, error } = await adminClient.from(TABLE).insert({
    created_by: userId,
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
  adminClient: ReturnType<typeof createClient>,
  url: string,
  userId: string,
  jobId: string,
  apiKey: string,
): Promise<Response> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return json({ error: "studio_job_not_found" }, 404);
  }
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await adminClient.from(TABLE)
    .update({ processing: true, processing_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("created_by", userId)
    .or("processing.eq.false,processing_started_at.lt." + staleBefore)
    .select("*")
    .maybeSingle();

  if (claimError) return json({ error: "studio_job_lookup_failed" }, 500);
  if (!claimed) {
    const current = await getJob(adminClient, jobId, userId);
    if (!current) return json({ error: "studio_job_not_found" }, 404);
    return json(await jobSnapshot(adminClient, url, current));
  }

  const job = claimed as JobRow;
  if (job.status === "needs_review" || job.status === "failed") {
    return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, userId, {
      status: job.status,
      processing: false,
    })));
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
      return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, userId, {
        status: "review_pending",
        art_versions: [{ version: 1, path }],
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
      return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, userId, {
        validation,
        status: shouldCorrect ? "correction_pending" : "mockup_front_pending",
        error_code: null,
      })));
    }

    if (job.status === "correction_pending") {
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
      const path = job.id + "/art-v2.webp";
      await uploadPrivate(adminClient, path, bytes, "image/webp");
      const versions = [...(Array.isArray(job.art_versions) ? job.art_versions : []), { version: 2, path }];
      return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, userId, {
        art_versions: versions,
        correction_count: 1,
        status: "review_pending",
        error_code: null,
      })));
    }

    if (job.status === "mockup_front_pending" || job.status === "mockup_back_pending") {
      const side: Side = job.status === "mockup_front_pending" ? "front" : "back";
      const art = latestArt(job);
      if (!art) throw new Error("studio_art_missing");
      const artBytes = await downloadPrivate(adminClient, art.path);
      const bytes = await openAIImage(apiKey, makeMockupPrompt(side, job.input), "1024x1024", {
        bytes: artBytes,
        fileName: "caneca-facil-arte.webp",
        mimeType: "image/webp",
      });
      const version = side === "front" ? 1 : 2;
      const path = job.id + "/mockup-v" + version + ".webp";
      await uploadPrivate(adminClient, path, bytes, "image/webp");
      const mockups = [...(Array.isArray(job.mockups) ? job.mockups : []), { version, side, path }];
      const isLast = side === "back";
      return json(await jobSnapshot(adminClient, url, await writeJob(adminClient, job.id, userId, {
        mockups,
        status: isLast ? "needs_review" : "mockup_back_pending",
        error_code: null,
      })));
    }

    throw new Error("studio_job_step_failed");
  } catch {
    console.error("[caneca-studio] generation step failed", { jobId: job.id, status: job.status });
    try {
      const failed = await writeJob(adminClient, job.id, userId, {
        status: "failed",
        error_code: "studio_job_step_failed",
      });
      return json(await jobSnapshot(adminClient, url, failed));
    } catch {
      return json({ error: "studio_job_step_failed" }, 500);
    }
  }
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = await authorize(request);
  if (authorization instanceof Response) return authorization;
  const { user, adminClient, url } = authorization;

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
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: "studio_job_lookup_failed" }, 500);
    const snapshot = await jobSnapshot(adminClient, url, data as JobRow | null);
    return json({ job: snapshot });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim() || "";
  if (!apiKey) return json({ error: "studio_not_configured" }, 503);

  if (action === "start") {
    if (!form) return json({ error: "invalid_studio_input" }, 400);
    try {
      return await startJob(adminClient, url, user.id, form);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_studio_input") {
        return json({ error: "invalid_studio_input" }, 400);
      }
      console.error("[caneca-studio] could not start job");
      return json({ error: "studio_job_start_failed" }, 500);
    }
  }

  if (action === "advance") {
    if (typeof body.jobId !== "string") return json({ error: "studio_job_not_found" }, 404);
    return await advanceJob(adminClient, url, user.id, body.jobId, apiKey);
  }

  return json({ error: "invalid_studio_input" }, 400);
}

Deno.serve(handleRequest);
