export type CreationMode = 'reference' | 'from_scratch';

export type BriefingRequirementLevel =
  | 'required'
  | 'preference'
  | 'creative_freedom';

export interface BriefingReference {
  mediaId: string;
  order: number;
  role?: string;
}

export type BriefingMissingKey =
  | 'creation_mode'
  | 'reference'
  | 'creative_context'
  | 'style_or_creative_freedom';

export interface BriefingQuestion {
  key: BriefingMissingKey;
  text: string;
}

export interface Briefing {
  creationMode?: CreationMode;
  occasion?: string;
  recipient?: string;
  mainTheme?: string;
  desiredStyle?: string;
  colorPreferences: string[];
  mandatoryText: string[];
  names: string[];
  dates: string[];
  mandatoryElements: string[];
  forbiddenElements: string[];
  references: BriefingReference[];
  compositionNotes?: string;
  creativeDirection?: string;
  creativeFreedom: boolean;
  missingInformation: BriefingMissingKey[];
  confidenceScore: number;
  readyToGenerate: boolean;
}

export type BriefingField =
  | 'creationMode'
  | 'occasion'
  | 'recipient'
  | 'mainTheme'
  | 'desiredStyle'
  | 'colorPreferences'
  | 'mandatoryText'
  | 'names'
  | 'dates'
  | 'mandatoryElements'
  | 'forbiddenElements'
  | 'references'
  | 'compositionNotes'
  | 'creativeDirection';

export type BriefingEditableFields = Pick<Briefing, BriefingField>;

export interface BriefingExtraction {
  set: Partial<BriefingEditableFields>;
  replace: Partial<BriefingEditableFields>;
  creativeFreedom?: boolean;
  confidenceScore: number;
  ambiguousFields: BriefingField[];
}

const ARRAY_FIELDS = new Set<BriefingField>([
  'colorPreferences',
  'mandatoryText',
  'names',
  'dates',
  'mandatoryElements',
  'forbiddenElements',
  'references',
]);

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function mergeStrings(previous: string[], incoming: string[]): string[] {
  const result = [...previous];
  for (const value of incoming) {
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function mergeReferences(
  previous: BriefingReference[],
  incoming: BriefingReference[],
): BriefingReference[] {
  const result = previous.map((reference) => ({ ...reference }));
  for (const reference of incoming) {
    if (!result.some((existing) => existing.mediaId === reference.mediaId)) {
      result.push({ ...reference });
    }
  }
  return result;
}

function copyBriefing(briefing: Briefing): Briefing {
  return {
    ...briefing,
    colorPreferences: [...briefing.colorPreferences],
    mandatoryText: [...briefing.mandatoryText],
    names: [...briefing.names],
    dates: [...briefing.dates],
    mandatoryElements: [...briefing.mandatoryElements],
    forbiddenElements: [...briefing.forbiddenElements],
    references: briefing.references.map((reference) => ({ ...reference })),
    missingInformation: [...briefing.missingInformation],
  };
}

export function getMissingBriefingInformation(
  briefing: Briefing,
): BriefingMissingKey[] {
  const missing: BriefingMissingKey[] = [];

  if (!briefing.creationMode) {
    missing.push('creation_mode');
  }

  if (briefing.creationMode === 'reference' && briefing.references.length === 0) {
    missing.push('reference');
  }

  const hasCreativeContext =
    hasText(briefing.mainTheme) ||
    hasText(briefing.occasion) ||
    hasText(briefing.recipient) ||
    hasText(briefing.creativeDirection) ||
    briefing.references.length > 0;

  if (!hasCreativeContext) {
    missing.push('creative_context');
  }

  const styleResolved =
    hasText(briefing.desiredStyle) ||
    hasText(briefing.creativeDirection) ||
    briefing.creativeFreedom;

  if (!styleResolved) {
    missing.push('style_or_creative_freedom');
  }

  return missing;
}

export function isBriefingReady(briefing: Briefing): boolean {
  return getMissingBriefingInformation(briefing).length === 0;
}

export function createEmptyBriefing(): Briefing {
  const briefing: Briefing = {
    colorPreferences: [],
    mandatoryText: [],
    names: [],
    dates: [],
    mandatoryElements: [],
    forbiddenElements: [],
    references: [],
    creativeFreedom: false,
    missingInformation: [],
    confidenceScore: 0,
    readyToGenerate: false,
  };

  briefing.missingInformation = getMissingBriefingInformation(briefing);
  return briefing;
}

function applySet(target: Briefing, set: Partial<BriefingEditableFields>): void {
  for (const field of Object.keys(set) as BriefingField[]) {
    const incoming = set[field];
    if (incoming === undefined) continue;

    if (ARRAY_FIELDS.has(field)) {
      if (field === 'references') {
        target.references = mergeReferences(
          target.references,
          incoming as BriefingReference[],
        );
      } else {
        const current = target[field] as string[];
        (target as unknown as Record<string, unknown>)[field] = mergeStrings(
          current,
          incoming as string[],
        );
      }
      continue;
    }

    const current = target[field];
    if (current === undefined || current === '') {
      (target as unknown as Record<string, unknown>)[field] = incoming;
    }
  }
}

function applyReplace(
  target: Briefing,
  replace: Partial<BriefingEditableFields>,
): void {
  for (const field of Object.keys(replace) as BriefingField[]) {
    const incoming = replace[field];
    if (incoming === undefined) continue;

    if (field === 'references') {
      target.references = (incoming as BriefingReference[]).map((reference) => ({
        ...reference,
      }));
      continue;
    }

    if (ARRAY_FIELDS.has(field)) {
      (target as unknown as Record<string, unknown>)[field] = [
        ...(incoming as string[]),
      ];
      continue;
    }

    (target as unknown as Record<string, unknown>)[field] = incoming;
  }
}

export function mergeBriefing(
  previous: Briefing,
  extraction: BriefingExtraction,
): Briefing {
  const next = copyBriefing(previous);

  applySet(next, extraction.set);
  applyReplace(next, extraction.replace);

  if (typeof extraction.creativeFreedom === 'boolean') {
    next.creativeFreedom = extraction.creativeFreedom;
  }

  next.confidenceScore = extraction.confidenceScore;
  next.missingInformation = getMissingBriefingInformation(next);
  next.readyToGenerate = next.missingInformation.length === 0;

  return next;
}

export function getNextBriefingQuestion(
  briefing: Briefing,
): BriefingQuestion | null {
  const missing = getMissingBriefingInformation(briefing);

  if (missing.includes('creation_mode')) {
    return {
      key: 'creation_mode',
      text: 'Você já tem uma imagem ou modelo como referência, ou quer criar a caneca do zero?',
    };
  }

  if (missing.includes('reference')) {
    return {
      key: 'reference',
      text: 'Envie a imagem que você quer usar como referência para a caneca.',
    };
  }

  if (missing.includes('creative_context')) {
    return {
      key: 'creative_context',
      text: 'Para quem ou para qual ocasião é a caneca? Pode me contar a ideia principal.',
    };
  }

  if (missing.includes('style_or_creative_freedom')) {
    return {
      key: 'style_or_creative_freedom',
      text: 'Você prefere algum estilo específico ou posso criar com liberdade?',
    };
  }

  return null;
}
