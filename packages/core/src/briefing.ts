export type CreationMode = 'reference' | 'from_scratch';

export type BriefingRequirementLevel = 'required' | 'preference' | 'creative_freedom';

export interface BriefingReference {
  mediaId: string;
  order: number;
  role?: string;
}

export interface Briefing {
  creationMode: CreationMode;
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
  missingInformation: string[];
  confidenceScore: number;
  readyToGenerate: boolean;
}

export type BriefingEditableField = Exclude<keyof Briefing, 'missingInformation' | 'confidenceScore' | 'readyToGenerate'>;
export type BriefingPatch = Partial<Pick<Briefing, BriefingEditableField>>;

export interface BriefingEvaluation {
  missingInformation: string[];
  confidenceScore: number;
  readyToGenerate: boolean;
  nextQuestion?: string;
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const hasText = (value?: string) => Boolean(value?.trim());

export function createEmptyBriefing(creationMode: CreationMode = 'from_scratch'): Briefing {
  return evaluateBriefing({
    creationMode,
    colorPreferences: [],
    mandatoryText: [],
    names: [],
    dates: [],
    mandatoryElements: [],
    forbiddenElements: [],
    references: [],
    missingInformation: [],
    confidenceScore: 0,
    readyToGenerate: false,
  });
}

/** Merge only facts explicitly present in a newly interpreted customer turn. */
export function mergeBriefing(current: Briefing, patch: BriefingPatch): Briefing {
  const merged: Briefing = {
    ...current,
    ...patch,
    colorPreferences: patch.colorPreferences ? unique(patch.colorPreferences) : current.colorPreferences,
    mandatoryText: patch.mandatoryText ? unique(patch.mandatoryText) : current.mandatoryText,
    names: patch.names ? unique(patch.names) : current.names,
    dates: patch.dates ? unique(patch.dates) : current.dates,
    mandatoryElements: patch.mandatoryElements ? unique(patch.mandatoryElements) : current.mandatoryElements,
    forbiddenElements: patch.forbiddenElements ? unique(patch.forbiddenElements) : current.forbiddenElements,
    references: patch.references ? [...patch.references].sort((a, b) => a.order - b.order) : current.references,
  };
  return evaluateBriefing(merged);
}

/** Explicit correction replaces only the targeted field and preserves unrelated facts. */
export function correctBriefingField<K extends BriefingEditableField>(current: Briefing, field: K, value: Briefing[K]): Briefing {
  return mergeBriefing(current, { [field]: value } as BriefingPatch);
}

export function getMissingBriefingInformation(briefing: Briefing): string[] {
  const missing: string[] = [];
  if (!hasText(briefing.mainTheme)) missing.push('mainTheme');
  if (briefing.creationMode === 'reference' && briefing.references.length === 0) missing.push('references');
  if (!hasText(briefing.desiredStyle) && !hasText(briefing.creativeDirection)) missing.push('creativeDirection');
  return missing;
}

export function getNextBriefingQuestion(missingInformation: string[]): string | undefined {
  const field = missingInformation[0];
  if (field === 'mainTheme') return 'Qual é a ideia principal que você quer na caneca?';
  if (field === 'references') return 'Pode me enviar a imagem que você quer usar como referência?';
  if (field === 'creativeDirection') return 'Você tem algum estilo em mente ou prefere que eu crie livremente?';
  return undefined;
}

export function evaluateBriefing(input: Briefing): Briefing {
  const missingInformation = getMissingBriefingInformation(input);
  const totalSignals = 3;
  const confidenceScore = Number(((totalSignals - missingInformation.length) / totalSignals).toFixed(2));
  return {
    ...input,
    missingInformation,
    confidenceScore,
    readyToGenerate: missingInformation.length === 0,
  };
}

export function getBriefingEvaluation(briefing: Briefing): BriefingEvaluation {
  const evaluated = evaluateBriefing(briefing);
  return {
    missingInformation: evaluated.missingInformation,
    confidenceScore: evaluated.confidenceScore,
    readyToGenerate: evaluated.readyToGenerate,
    nextQuestion: getNextBriefingQuestion(evaluated.missingInformation),
  };
}
