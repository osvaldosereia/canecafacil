export const PROMPT_LIBRARY_STORAGE_KEY = 'caneca-360-prompt-library-v1';
export const MAX_PROMPT_NOTES_LENGTH = 1000;
export const MAX_QUICK_COMMAND_INSTRUCTION_LENGTH = 800;
const MAX_CATEGORY_NAME_LENGTH = 60;
const MAX_COMMAND_TITLE_LENGTH = 80;

export interface PromptCategory {
  id: string;
  name: string;
}

export interface QuickPromptCommand {
  id: string;
  title: string;
  instruction: string;
  categoryId: string | null;
}

export interface PromptLibrary {
  version: 1;
  categories: PromptCategory[];
  commands: QuickPromptCommand[];
}

export interface PromptLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type QuickPromptCommandDraft = Omit<QuickPromptCommand, 'id'>;

const STARTER_CATEGORIES: PromptCategory[] = [
  { id: 'starter-composicao', name: 'Composição da caneca' },
  { id: 'starter-tipografia', name: 'Texto e tipografia' },
  { id: 'starter-cores', name: 'Cores e fundo' },
  { id: 'starter-estilos', name: 'Estilos visuais' },
  { id: 'starter-impressao', name: 'Impressão e acabamento' },
];

const STARTER_COMMANDS: QuickPromptCommand[] = [
  {
    id: 'starter-panorama', categoryId: 'starter-composicao', title: 'Composição panorâmica',
    instruction: 'Organize os elementos como uma composição horizontal contínua, equilibrada ao longo de toda a área da caneca, sem concentrar tudo no centro.',
  },
  {
    id: 'starter-laterais-organicas', categoryId: 'starter-composicao', title: 'Laterais orgânicas',
    instruction: 'Faça o fundo ou os elementos decorativos chegarem às laterais com transições naturais e orgânicas, sem terminar em cortes retos artificiais.',
  },
  {
    id: 'starter-respiro', categoryId: 'starter-composicao', title: 'Mais espaço e respiro',
    instruction: 'Distribua os elementos com espaço visual entre eles. Evite sobreposição e preserve uma área limpa para a arte respirar.',
  },
  {
    id: 'starter-centro', categoryId: 'starter-composicao', title: 'Tema em destaque',
    instruction: 'Dê destaque claro ao tema principal e organize os elementos secundários ao redor sem competir com ele.',
  },
  {
    id: 'starter-texto-exato', categoryId: 'starter-tipografia', title: 'Preservar texto exato',
    instruction: 'Reproduza somente os textos informados no campo de texto exato, preservando letras, acentos, pontuação e ordem. Não invente palavras.',
  },
  {
    id: 'starter-tipografia-legivel', categoryId: 'starter-tipografia', title: 'Texto legível na caneca',
    instruction: 'Use letras nítidas, bem espaçadas e com contraste suficiente com o fundo. Mantenha o texto importante longe das bordas.',
  },
  {
    id: 'starter-hierarquia', categoryId: 'starter-tipografia', title: 'Hierarquia de texto',
    instruction: 'Se houver mais de uma frase fornecida, destaque a principal e use os textos restantes em tamanho menor, mantendo leitura clara.',
  },
  {
    id: 'starter-paleta-coesa', categoryId: 'starter-cores', title: 'Paleta harmônica',
    instruction: 'Use uma paleta curta e harmoniosa, com contraste suficiente para destacar o tema e os textos.',
  },
  {
    id: 'starter-fundo-integrado', categoryId: 'starter-cores', title: 'Fundo integrado',
    instruction: 'Integre o fundo à ilustração com textura ou elementos decorativos discretos, sem criar uma moldura pesada.',
  },
  {
    id: 'starter-cores-suaves', categoryId: 'starter-cores', title: 'Cores suaves',
    instruction: 'Prefira cores suaves e equilibradas, preservando detalhes visíveis e contraste adequado para impressão.',
  },
  {
    id: 'starter-aquarela', categoryId: 'starter-estilos', title: 'Aquarela delicada',
    instruction: 'Use aparência de aquarela com pinceladas leves, contornos naturais e textura sutil, mantendo os elementos principais bem definidos.',
  },
  {
    id: 'starter-minimalista', categoryId: 'starter-estilos', title: 'Minimalista elegante',
    instruction: 'Use poucos elementos, formas limpas e composição elegante, sem excesso de ornamentos ou detalhes pequenos.',
  },
  {
    id: 'starter-vintage', categoryId: 'starter-estilos', title: 'Retrô acolhedor',
    instruction: 'Use cores e formas com inspiração retrô, textura gráfica discreta e aparência acolhedora, sem reproduzir marcas ou personagens conhecidos.',
  },
  {
    id: 'starter-arte-aberta', categoryId: 'starter-impressao', title: 'Arte aberta para impressão',
    instruction: 'Entregue somente a arte plana e aberta, sem desenhar a caneca, mãos, cenário ou mockup de produto.',
  },
  {
    id: 'starter-area-segura', categoryId: 'starter-impressao', title: 'Área segura de impressão',
    instruction: 'Mantenha rostos, textos e símbolos importantes afastados das bordas superior e inferior, com margem segura para o corte e a aplicação na caneca.',
  },
  {
    id: 'starter-definicao', categoryId: 'starter-impressao', title: 'Detalhes nítidos',
    instruction: 'Mantenha contornos e detalhes principais nítidos, sem elementos muito finos ou pequenos que possam desaparecer na impressão.',
  },
];

function defaultStorage(): PromptLibraryStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `command-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function validatedName(value: string, maximum: number, label: string): string {
  const result = value.trim().replace(/\s+/g, ' ');
  if (!result || result.length > maximum) throw new Error(`${label} deve ter entre 1 e ${maximum} caracteres.`);
  return result;
}

export function createStarterPromptLibrary(): PromptLibrary {
  return {
    version: 1,
    categories: STARTER_CATEGORIES.map((category) => ({ ...category })),
    commands: STARTER_COMMANDS.map((command) => ({ ...command })),
  };
}

export function parsePromptLibrary(value: unknown): PromptLibrary | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PromptLibrary>;
  if (candidate.version !== 1 || !Array.isArray(candidate.categories) || !Array.isArray(candidate.commands)) return null;
  if (candidate.categories.length > 200 || candidate.commands.length > 2000) return null;

  const categories = candidate.categories.filter((item): item is PromptCategory =>
    Boolean(item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && item.name.trim())
  ).map((item) => ({ id: item.id, name: item.name.trim().slice(0, MAX_CATEGORY_NAME_LENGTH) }));
  if (categories.length !== candidate.categories.length ||
    new Set(categories.map((category) => category.id)).size !== categories.length ||
    new Set(categories.map((category) => normalizedName(category.name))).size !== categories.length) return null;
  const categoryIds = new Set(categories.map((category) => category.id));
  const commands = candidate.commands.filter((item): item is QuickPromptCommand =>
    Boolean(item && typeof item.id === 'string' && item.id && typeof item.title === 'string' && item.title.trim() &&
      typeof item.instruction === 'string' && item.instruction.trim() &&
      (item.categoryId === null || typeof item.categoryId === 'string'))
  ).map((item) => ({
    id: item.id,
    title: item.title.trim().slice(0, MAX_COMMAND_TITLE_LENGTH),
    instruction: item.instruction.trim().slice(0, MAX_QUICK_COMMAND_INSTRUCTION_LENGTH),
    categoryId: item.categoryId && categoryIds.has(item.categoryId) ? item.categoryId : null,
  }));
  if (commands.length !== candidate.commands.length || new Set(commands.map((command) => command.id)).size !== commands.length) return null;

  return { version: 1, categories, commands };
}

export function loadPromptLibrary(storage: PromptLibraryStorage | null = defaultStorage()): PromptLibrary {
  if (!storage) return createStarterPromptLibrary();
  try {
    const value = storage.getItem(PROMPT_LIBRARY_STORAGE_KEY);
    if (!value) return createStarterPromptLibrary();
    return parsePromptLibrary(JSON.parse(value)) ?? createStarterPromptLibrary();
  } catch {
    return createStarterPromptLibrary();
  }
}

export function savePromptLibrary(
  library: PromptLibrary,
  storage: PromptLibraryStorage | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PROMPT_LIBRARY_STORAGE_KEY, JSON.stringify(library));
    return true;
  } catch {
    // The picker remains usable if browser storage is blocked or full.
    return false;
  }
}

export function addPromptCategory(library: PromptLibrary, name: string, id = createId()): PromptLibrary {
  const validName = validatedName(name, MAX_CATEGORY_NAME_LENGTH, 'O nome da categoria');
  if (library.categories.some((category) => normalizedName(category.name) === normalizedName(validName))) {
    throw new Error('Já existe uma categoria com esse nome.');
  }
  return { ...library, categories: [...library.categories, { id, name: validName }] };
}

export function updatePromptCategory(library: PromptLibrary, categoryId: string, name: string): PromptLibrary {
  const category = library.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error('Esta categoria não existe mais.');
  const validName = validatedName(name, MAX_CATEGORY_NAME_LENGTH, 'O nome da categoria');
  if (library.categories.some((item) => item.id !== categoryId && normalizedName(item.name) === normalizedName(validName))) {
    throw new Error('Já existe uma categoria com esse nome.');
  }
  return {
    ...library,
    categories: library.categories.map((item) => item.id === categoryId ? { ...item, name: validName } : item),
  };
}

export function removePromptCategory(library: PromptLibrary, categoryId: string): PromptLibrary {
  return {
    ...library,
    categories: library.categories.filter((category) => category.id !== categoryId),
    commands: library.commands.map((command) => command.categoryId === categoryId ? { ...command, categoryId: null } : command),
  };
}

export function addQuickCommand(
  library: PromptLibrary,
  draft: QuickPromptCommandDraft,
  id = createId(),
): PromptLibrary {
  const title = validatedName(draft.title, MAX_COMMAND_TITLE_LENGTH, 'O nome do comando');
  const instruction = draft.instruction.trim();
  if (!instruction || instruction.length > MAX_QUICK_COMMAND_INSTRUCTION_LENGTH) {
    throw new Error(`A instrução deve ter entre 1 e ${MAX_QUICK_COMMAND_INSTRUCTION_LENGTH} caracteres.`);
  }
  if (!draft.categoryId || !library.categories.some((category) => category.id === draft.categoryId)) {
    throw new Error('Escolha uma categoria para o comando.');
  }
  return { ...library, commands: [...library.commands, { id, title, instruction, categoryId: draft.categoryId }] };
}

export function updateQuickCommand(
  library: PromptLibrary,
  commandId: string,
  draft: QuickPromptCommandDraft,
): PromptLibrary {
  if (!library.commands.some((command) => command.id === commandId)) throw new Error('Este comando não existe mais.');
  const updated = addQuickCommand({ ...library, commands: [] }, draft, commandId).commands[0];
  return { ...library, commands: library.commands.map((command) => command.id === commandId ? updated : command) };
}

export function removeQuickCommand(library: PromptLibrary, commandId: string): PromptLibrary {
  return { ...library, commands: library.commands.filter((command) => command.id !== commandId) };
}

export function composePromptNotes(
  manualNotes: string,
  commands: Array<Pick<QuickPromptCommand, 'id' | 'title' | 'instruction'>>,
): string {
  const notes = manualNotes.trim();
  const quickCommands = commands.length
    ? 'Comandos rápidos selecionados como orientações complementares:\n' +
      commands.map((command) => `- ${command.title.trim()}: ${command.instruction.trim()}`).join('\n')
    : '';
  const result = [notes, quickCommands].filter(Boolean).join('\n\n');
  if (result.length > MAX_PROMPT_NOTES_LENGTH) {
    throw new Error(`O briefing ficou muito longo. Reduza as anotações ou selecione menos comandos (limite de ${MAX_PROMPT_NOTES_LENGTH} caracteres).`);
  }
  return result;
}
