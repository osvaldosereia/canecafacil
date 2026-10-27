import OpenAI, { toFile } from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_CANVAS = { width: 2400, height: 960 };
const SIGNED_URL_TTL_SECONDS = 900;

export interface StudioReference {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export interface StudioJobInput {
  title: string;
  creationMode: 'reference' | 'from_scratch';
  occasion: string | null;
  recipient: string | null;
  mainTheme: string;
  desiredStyle: string | null;
  colorPreferences: string[];
  mandatoryText: string[];
  mandatoryElements: string[];
  forbiddenElements: string[];
  compositionNotes: string | null;
  reference: StudioReference | null;
}

interface CanvasSize {
  width: number;
  height: number;
  templateId: string | null;
}

interface CreatedProject {
  projectId: string;
  conversationId: string;
  briefingId: string;
  canvas: CanvasSize;
}

function ensureSuccess(error: { message?: string } | null, message: string): void {
  if (error) throw new Error(message);
}

function safeFileExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function validateReference(reference: StudioReference): void {
  if (reference.bytes.byteLength === 0 || reference.bytes.byteLength > 8 * 1024 * 1024) {
    throw new Error('invalid_reference');
  }

  const bytes = reference.bytes;
  let detectedMime = '';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    detectedMime = 'image/png';
  } else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detectedMime = 'image/jpeg';
  } else if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    detectedMime = 'image/webp';
  }

  if (!detectedMime || detectedMime !== reference.mimeType) {
    throw new Error('invalid_reference');
  }
}

function resolveCanvas(template: Record<string, unknown> | null): CanvasSize {
  const templateId = typeof template?.id === 'string' ? template.id : null;
  const width = Number(template?.output_width_px);
  const height = Number(template?.output_height_px);

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { ...DEFAULT_CANVAS, templateId };
  }

  const scale = Math.min(1, 3840 / width, 2160 / height);
  const fittedWidth = Math.floor((width * scale) / 16) * 16;
  const fittedHeight = Math.floor((height * scale) / 16) * 16;
  const ratio = fittedWidth / fittedHeight;

  if (fittedWidth < 256 || fittedHeight < 256 || fittedWidth * fittedHeight < 655360 || ratio < 1 / 3 || ratio > 3) {
    return { ...DEFAULT_CANVAS, templateId };
  }

  return { width: fittedWidth, height: fittedHeight, templateId };
}

async function getCanvas(client: SupabaseClient): Promise<CanvasSize> {
  const { data, error } = await client
    .from('mug_templates')
    .select('id,output_width_px,output_height_px')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  ensureSuccess(error, 'studio_template_lookup_failed');
  return resolveCanvas(data as Record<string, unknown> | null);
}

async function createProjectRecords(
  client: SupabaseClient,
  input: StudioJobInput,
  canvas: CanvasSize,
): Promise<CreatedProject> {
  let visitorId: string | null = null;
  let conversationId: string | null = null;
  let projectId: string | null = null;

  try {
    const visitor = await client.from('chat_visitors').insert({}).select('id').single();
    ensureSuccess(visitor.error, 'studio_project_create_failed');
    visitorId = visitor.data?.id;
    if (!visitorId) throw new Error('studio_project_create_failed');

    const now = new Date().toISOString();
    const conversation = await client
      .from('conversations')
      .insert({
        visitor_id: visitorId,
        status: 'closed',
        automation_mode: 'human',
        finished_at: now,
      })
      .select('id')
      .single();
    ensureSuccess(conversation.error, 'studio_project_create_failed');
    conversationId = conversation.data?.id;
    if (!conversationId) throw new Error('studio_project_create_failed');

    const project = await client
      .from('mug_projects')
      .insert({
        conversation_id: conversationId,
        template_id: canvas.templateId,
        title: input.title,
        creation_mode: input.creationMode,
        status: 'generating_art',
      })
      .select('id')
      .single();
    ensureSuccess(project.error, 'studio_project_create_failed');
    projectId = project.data?.id;
    if (!projectId) throw new Error('studio_project_create_failed');

    const briefing = await client
      .from('briefings')
      .insert({
        project_id: projectId,
        version: 1,
        creation_mode: input.creationMode,
        occasion: input.occasion,
        recipient: input.recipient,
        main_theme: input.mainTheme,
        desired_style: input.desiredStyle,
        color_preferences: input.colorPreferences,
        mandatory_text: input.mandatoryText,
        mandatory_elements: input.mandatoryElements,
        forbidden_elements: input.forbiddenElements,
        composition_notes: input.compositionNotes,
        creative_direction: input.desiredStyle,
        reference_items: input.reference ? [{ role: 'studio_reference' }] : [],
        ready_to_generate: true,
      })
      .select('id')
      .single();
    ensureSuccess(briefing.error, 'studio_project_create_failed');
    const briefingId = briefing.data?.id;
    if (!briefingId) throw new Error('studio_project_create_failed');

    const projectUpdate = await client
      .from('mug_projects')
      .update({ current_briefing_id: briefingId })
      .eq('id', projectId);
    ensureSuccess(projectUpdate.error, 'studio_project_create_failed');

    const conversationUpdate = await client
      .from('conversations')
      .update({ active_project_id: projectId })
      .eq('id', conversationId);
    ensureSuccess(conversationUpdate.error, 'studio_project_create_failed');

    return { projectId, conversationId, briefingId, canvas };
  } catch (error) {
    if (projectId) await client.from('mug_projects').delete().eq('id', projectId);
    if (conversationId) await client.from('conversations').delete().eq('id', conversationId);
    if (visitorId) await client.from('chat_visitors').delete().eq('id', visitorId);
    throw error;
  }
}

async function uploadPrivateAsset(
  client: SupabaseClient,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage.from(bucket).upload(path, Buffer.from(bytes), {
    contentType,
    upsert: false,
  });
  ensureSuccess(error, 'studio_asset_upload_failed');
}

function makeArtPrompt(input: StudioJobInput, canvas: CanvasSize): string {
  const lines = [
    'Create only the flat 2D artwork for printing as a wrap on a ceramic mug. Never draw a mug, product mockup, hands, table, or room.',
    'Final landscape canvas: ' + canvas.width + ' x ' + canvas.height + ' pixels; physical target approximately 24 x 9.5 cm.',
    'Let the artwork fill the usable height, with small safe margins above and below. Do not squash, stretch, or compress the main design into a low narrow band.',
    'Keep faces, people, animals, required text, and important symbols comfortably inside the upper and lower edges. Backgrounds, patterns, and natural bleed may continue to the canvas edges.',
    'Do not invent lettering, names, dates, or random text. Include only exact wording supplied in the briefing.',
    'Theme: ' + input.mainTheme,
  ];

  if (input.occasion) lines.push('Occasion: ' + input.occasion);
  if (input.recipient) lines.push('Made for: ' + input.recipient);
  if (input.desiredStyle) lines.push('Visual style: ' + input.desiredStyle);
  if (input.colorPreferences.length) {
    lines.push('Color palette: ' + input.colorPreferences.join(', '));
  }
  if (input.mandatoryText.length) {
    lines.push(
      'Required exact text, preserving accents, spelling, and punctuation: ' +
        input.mandatoryText.map((item) => '"' + item + '"').join('; '),
    );
  }
  if (input.mandatoryElements.length) {
    lines.push('Required visual elements: ' + input.mandatoryElements.join('; '));
  }
  if (input.forbiddenElements.length) {
    lines.push('Elements to avoid: ' + input.forbiddenElements.join('; '));
  }
  if (input.compositionNotes) {
    lines.push('Composition notes: ' + input.compositionNotes);
  }

  lines.push(
    'Create a polished, balanced proposal for human review before production. Do not add watermarks or unrelated lettering.',
  );
  return lines.join('\n');
}
function makeMockupPrompt(side: 'front' | 'back', input: StudioJobInput): string {
  const sideDescription =
    side === 'front'
      ? 'Show the main front face of one classic white ceramic mug.'
      : 'Show the opposite side of the same classic white ceramic mug, with the artwork visible around the curve.';

  return [
    'Create a clean commercial product photograph of one white ceramic mug using the supplied flat artwork as its printed wrap.',
    'Preserve the supplied artwork colors, text, and visual composition as closely as possible.',
    sideDescription,
    'Use soft natural studio lighting, a simple warm neutral background, and a realistic ceramic finish.',
    'Do not add extra logos, text, props that cover the mug, or additional mugs.',
    'Theme brief: ' + input.mainTheme,
  ].join(' ');
}

export interface ArtQualityReview {
  approved: boolean;
  score: number;
  blocking_issues: string[];
  warnings: string[];
  exact_text_ok: boolean | null;
  brief_ok: boolean;
  edges_ok: boolean;
  recommendation: 'approve' | 'regenerate' | 'manual_review';
  concise_note: string;
}

function manualReview(note: string): ArtQualityReview {
  return {
    approved: false,
    score: 0,
    blocking_issues: [],
    warnings: ['A revisão automática não ficou disponível nesta tentativa.'],
    exact_text_ok: null,
    brief_ok: false,
    edges_ok: false,
    recommendation: 'manual_review',
    concise_note: note,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 8);
}

function parseQualityReview(text: string): ArtQualityReview {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const blockingIssues = stringList(value.blocking_issues);
    const warnings = stringList(value.warnings);
    const score = typeof value.score === 'number' && Number.isFinite(value.score)
      ? Math.max(0, Math.min(100, Math.round(value.score)))
      : 0;
    const recommendation =
      value.recommendation === 'approve' ||
      value.recommendation === 'regenerate' ||
      value.recommendation === 'manual_review'
        ? value.recommendation
        : 'manual_review';
    const exactTextOk =
      typeof value.exact_text_ok === 'boolean' ? value.exact_text_ok : null;
    const briefOk = value.brief_ok === true;
    const edgesOk = value.edges_ok === true;
    const approved =
      value.approved === true &&
      blockingIssues.length === 0 &&
      exactTextOk !== false &&
      briefOk &&
      edgesOk;

    return {
      approved,
      score,
      blocking_issues: blockingIssues,
      warnings,
      exact_text_ok: exactTextOk,
      brief_ok: briefOk,
      edges_ok: edgesOk,
      recommendation: approved ? 'approve' : recommendation,
      concise_note:
        typeof value.concise_note === 'string'
          ? value.concise_note.trim().slice(0, 500)
          : 'Confira a arte manualmente antes de produzir.',
    };
  } catch {
    return manualReview('A revisão automática não retornou um resultado legível. Confira a arte manualmente.');
  }
}

async function reviewArtwork(
  openai: OpenAI,
  reviewModel: string,
  bytes: Uint8Array,
  input: StudioJobInput,
  project: CreatedProject,
): Promise<ArtQualityReview> {
  const reviewerPrompt = [
    'Você é o Quality Gate visual da CanecaFácil.',
    'Analise a arte gerada antes de mostrá-la à equipe. Seja rigoroso com erros objetivos, mas não reprove por preferência estética subjetiva.',
    'Compare a imagem com o briefing e com os textos exatos exigidos. Verifique: texto/nome exato quando exigido; presença dos elementos essenciais; cortes problemáticos nas laterais; composição utilizável como arte horizontal de caneca; erros visuais evidentes; aderência ao estilo e à paleta.',
    'Não invente detalhes sobre a imagem. Se não conseguir verificar algo, marque como incerto e recomende revisão manual.',
    'Aprovação automática só quando brief_ok e edges_ok forem true, exact_text_ok não for false, e não houver blocking_issues.',
    'Retorne apenas JSON válido com: approved (boolean), score (0-100), blocking_issues (array), warnings (array), exact_text_ok (boolean|null), brief_ok (boolean), edges_ok (boolean), recommendation (approve|regenerate|manual_review), concise_note (string).',
  ].join(' ');

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
    canvas: project.canvas.width + 'x' + project.canvas.height,
    reference_image_supplied: Boolean(input.reference),
  };

  try {
    const response = await openai.responses.create({
      model: reviewModel,
      store: false,
      max_output_tokens: 1200,
      text: { format: { type: 'json_object' } },
      input: [
        { role: 'developer', content: reviewerPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'BRIEFING ESPERADO (JSON):\n' + JSON.stringify(expectedBrief) +
                '\n\nA imagem anexada é a arte final a revisar.',
            },
            {
              type: 'input_image',
              image_url: 'data:image/webp;base64,' + Buffer.from(bytes).toString('base64'),
              detail: 'high',
            },
          ],
        },
      ],
    });
    return parseQualityReview(response.output_text ?? '');
  } catch {
    return manualReview('Não foi possível concluir a revisão automática. Confira a arte manualmente.');
  }
}

async function imageBytesFromResponse(
  result: { data?: Array<{ b64_json?: string | null }> | null },
): Promise<Uint8Array> {
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error('studio_image_generation_failed');
  return new Uint8Array(Buffer.from(encoded, 'base64'));
}

async function generateArtworkBytes(
  openai: OpenAI,
  model: string,
  input: StudioJobInput,
  canvas: CanvasSize,
  prompt: string,
  baseImage?: StudioReference,
): Promise<Uint8Array> {
  const size = canvas.width + 'x' + canvas.height;
  const imageInput = baseImage ?? input.reference;
  const result = imageInput
    ? await openai.images.edit({
        model,
        image: await toFile(Buffer.from(imageInput.bytes), imageInput.fileName, {
          type: imageInput.mimeType,
        }),
        prompt,
        size,
        quality: 'medium',
        output_format: 'webp',
        background: 'opaque',
      })
    : await openai.images.generate({
        model,
        prompt,
        size,
        quality: 'medium',
        output_format: 'webp',
        background: 'opaque',
        n: 1,
      });
  return imageBytesFromResponse(result);
}

async function saveArtVersion(
  client: SupabaseClient,
  project: CreatedProject,
  briefingId: string,
  model: string,
  version: number,
  parentVersionId: string | null,
  bytes: Uint8Array,
  prompt: string,
  review: ArtQualityReview,
): Promise<string> {
  const path = project.projectId + '/art-v' + version + '.webp';
  await uploadPrivateAsset(client, 'artwork-master', path, bytes, 'image/webp');

  const inserted = await client
    .from('art_versions')
    .insert({
      project_id: project.projectId,
      briefing_id: briefingId,
      version,
      parent_version_id: parentVersionId,
      generation_type: version === 1 ? 'initial' : 'regeneration',
      prompt_used: prompt,
      model,
      storage_bucket: 'artwork-master',
      storage_path: path,
      width: project.canvas.width,
      height: project.canvas.height,
      aspect_ratio: Number((project.canvas.width / project.canvas.height).toFixed(4)),
      generation_status: 'completed',
      quality_status: review.approved ? 'approved' : 'needs_review',
      validation_result: review,
    })
    .select('id')
    .single();
  ensureSuccess(inserted.error, 'studio_art_record_failed');
  const artVersionId = inserted.data?.id;
  if (!artVersionId) throw new Error('studio_art_record_failed');

  const update = await client
    .from('mug_projects')
    .update({
      current_art_version_id: artVersionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project.projectId);
  ensureSuccess(update.error, 'studio_art_record_failed');
  return artVersionId;
}

async function saveGeneratedArt(
  client: SupabaseClient,
  openai: OpenAI,
  project: CreatedProject,
  input: StudioJobInput,
  imageModel: string,
  reviewModel: string,
): Promise<{ artVersionId: string; artBytes: Uint8Array; validation: ArtQualityReview }> {
  const originalPrompt = makeArtPrompt(input, project.canvas);
  let prompt = originalPrompt;
  let bytes = await generateArtworkBytes(
    openai,
    imageModel,
    input,
    project.canvas,
    prompt,
  );
  let validation = await reviewArtwork(openai, reviewModel, bytes, input, project);
  let artVersionId = await saveArtVersion(
    client,
    project,
    project.briefingId,
    imageModel,
    1,
    null,
    bytes,
    prompt,
    validation,
  );

  if (!validation.approved && validation.recommendation === 'regenerate') {
    const corrections = validation.blocking_issues.length
      ? validation.blocking_issues.join('; ')
      : validation.concise_note;
    prompt =
      originalPrompt +
      '\n\nCORREÇÕES DO QUALITY GATE: corrija estes pontos objetivos sem alterar os demais requisitos: ' +
      corrections;
    const previousArt: StudioReference = {
      bytes,
      fileName: 'caneca-facil-arte-v1.webp',
      mimeType: 'image/webp',
    };
    bytes = await generateArtworkBytes(
      openai,
      imageModel,
      input,
      project.canvas,
      prompt,
      previousArt,
    );
    validation = await reviewArtwork(openai, reviewModel, bytes, input, project);
    artVersionId = await saveArtVersion(
      client,
      project,
      project.briefingId,
      imageModel,
      2,
      artVersionId,
      bytes,
      prompt,
      validation,
    );
  }

  const update = await client
    .from('mug_projects')
    .update({
      status: 'generating_mockup',
      current_art_version_id: artVersionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project.projectId);
  ensureSuccess(update.error, 'studio_art_record_failed');

  return { artVersionId, artBytes: bytes, validation };
}
async function saveMockup(
  client: SupabaseClient,
  openai: OpenAI,
  project: CreatedProject,
  input: StudioJobInput,
  artVersionId: string,
  model: string,
  version: number,
  side: 'front' | 'back',
  artBytes: Uint8Array,
): Promise<string> {
  const prompt = makeMockupPrompt(side, input);
  const result = await openai.images.edit({
    model,
    image: await toFile(Buffer.from(artBytes), 'caneca-facil-arte.webp', {
      type: 'image/webp',
    }),
    prompt,
    size: '1024x1024',
    quality: 'medium',
    output_format: 'webp',
    background: 'opaque',
  });
  const bytes = await imageBytesFromResponse(result);
  const path = project.projectId + '/mockup-v' + version + '.webp';
  await uploadPrivateAsset(client, 'mockups', path, bytes, 'image/webp');

  const inserted = await client
    .from('mockup_versions')
    .insert({
      project_id: project.projectId,
      art_version_id: artVersionId,
      template_id: project.canvas.templateId,
      version,
      prompt_used: prompt,
      model,
      storage_bucket: 'mockups',
      storage_path: path,
      generation_status: 'completed',
    })
    .select('id')
    .single();
  ensureSuccess(inserted.error, 'studio_mockup_record_failed');
  const mockupId = inserted.data?.id;
  if (!mockupId) throw new Error('studio_mockup_record_failed');

  const update = await client
    .from('mug_projects')
    .update({
      current_mockup_id: mockupId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project.projectId);
  ensureSuccess(update.error, 'studio_mockup_record_failed');
  return mockupId;
}

async function runGeneration(
  client: SupabaseClient,
  openai: OpenAI,
  project: CreatedProject,
  input: StudioJobInput,
  imageModel: string,
  reviewModel: string,
): Promise<void> {
  try {
    const { artVersionId, artBytes } = await saveGeneratedArt(
      client,
      openai,
      project,
      input,
      imageModel,
      reviewModel,
    );
    await saveMockup(client, openai, project, input, artVersionId, imageModel, 1, 'front', artBytes);
    await saveMockup(client, openai, project, input, artVersionId, imageModel, 2, 'back', artBytes);

    const update = await client
      .from('mug_projects')
      .update({ status: 'needs_review', updated_at: new Date().toISOString() })
      .eq('id', project.projectId);
    ensureSuccess(update.error, 'studio_project_status_update_failed');
  } catch (error) {
    console.error('[caneca-studio] generation failed', error);
    await client
      .from('mug_projects')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', project.projectId);
  }
}
export async function startStudioJob(
  client: SupabaseClient,
  openai: OpenAI,
  input: StudioJobInput,
  imageModel: string,
  reviewModel: string,
): Promise<{ projectId: string; status: string }> {
  if (input.reference) validateReference(input.reference);
  const canvas = await getCanvas(client);
  const project = await createProjectRecords(client, input, canvas);

  if (input.reference) {
    const path = project.projectId + '/reference.' + safeFileExtension(input.reference.mimeType);
    try {
      await uploadPrivateAsset(
        client,
        'customer-uploads',
        path,
        input.reference.bytes,
        input.reference.mimeType,
      );
      const media = await client.from('media_assets').insert({
        project_id: project.projectId,
        conversation_id: project.conversationId,
        media_type: 'image',
        storage_bucket: 'customer-uploads',
        storage_path: path,
        mime_type: input.reference.mimeType,
        original_filename: input.reference.fileName.slice(0, 255),
        reference_order: 1,
        reference_role: 'studio_reference',
        size_bytes: input.reference.bytes.byteLength,
      });
      ensureSuccess(media.error, 'studio_reference_record_failed');
    } catch (error) {
      await client
        .from('mug_projects')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', project.projectId);
      throw error;
    }
  }

  void runGeneration(client, openai, project, input, imageModel, reviewModel).catch((error) => {
    console.error('[caneca-studio] unexpected background failure', error);
  });
  return { projectId: project.projectId, status: 'generating_art' };
}

export interface StudioJobSnapshot {
  projectId: string;
  title: string | null;
  status: string;
  art: { version: number; url: string } | null;
  validation: ArtQualityReview | null;
  mockups: Array<{ version: number; url: string }>;
}

export async function getStudioJobSnapshot(
  client: SupabaseClient,
  projectId: string,
): Promise<StudioJobSnapshot | null> {
  const projectResult = await client
    .from('mug_projects')
    .select('id,title,status,current_art_version_id')
    .eq('id', projectId)
    .maybeSingle();
  ensureSuccess(projectResult.error, 'studio_job_lookup_failed');
  const project = projectResult.data as
    | { id: string; title: string | null; status: string; current_art_version_id: string | null }
    | null;
  if (!project) return null;

  let art: StudioJobSnapshot['art'] = null;
  let validation: ArtQualityReview | null = null;
  if (project.current_art_version_id) {
    const artResult = await client
      .from('art_versions')
      .select('version,storage_bucket,storage_path,validation_result')
      .eq('id', project.current_art_version_id)
      .maybeSingle();
    ensureSuccess(artResult.error, 'studio_job_lookup_failed');
    const row = artResult.data as
      | { version: number; storage_bucket: string; storage_path: string; validation_result: unknown }
      | null;
    if (row) {
      const signed = await client.storage
        .from(row.storage_bucket)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      if (!signed.error && signed.data?.signedUrl) {
        art = { version: row.version, url: signed.data.signedUrl };
      }
      if (row.validation_result && typeof row.validation_result === 'object') {
        validation = row.validation_result as ArtQualityReview;
      }
    }
  }

  const mockupResult = await client
    .from('mockup_versions')
    .select('version,storage_bucket,storage_path')
    .eq('project_id', projectId)
    .eq('generation_status', 'completed')
    .order('version', { ascending: true });
  ensureSuccess(mockupResult.error, 'studio_job_lookup_failed');
  const rows = (mockupResult.data ?? []) as Array<{
    version: number;
    storage_bucket: string;
    storage_path: string;
  }>;

  const mockups: StudioJobSnapshot['mockups'] = [];
  for (const row of rows) {
    const signed = await client.storage
      .from(row.storage_bucket)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
    if (!signed.error && signed.data?.signedUrl) {
      mockups.push({ version: row.version, url: signed.data.signedUrl });
    }
  }

  return {
    projectId: project.id,
    title: project.title,
    status: project.status,
    art,
    validation,
    mockups,
  };
}
