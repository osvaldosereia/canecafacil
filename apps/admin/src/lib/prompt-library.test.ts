import { describe, expect, it } from 'vitest';
import {
  MAX_PROMPT_NOTES_LENGTH,
  MAX_QUICK_COMMAND_INSTRUCTION_LENGTH,
  addPromptCategory,
  addQuickCommand,
  composePromptNotes,
  createStarterPromptLibrary,
  loadPromptLibrary,
  removePromptCategory,
  removeQuickCommand,
  savePromptLibrary,
  updatePromptCategory,
  updateQuickCommand,
  type PromptLibraryStorage,
} from './prompt-library';

function memoryStorage(): PromptLibraryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('biblioteca de comandos rápidos', () => {
  it('oferece categorias e comandos iniciais organizados para impressão em caneca', () => {
    const library = createStarterPromptLibrary();

    expect(library.categories.length).toBeGreaterThanOrEqual(4);
    expect(library.commands.length).toBeGreaterThanOrEqual(10);
    expect(library.commands.every((command) => library.categories.some((category) => category.id === command.categoryId))).toBe(true);
  });

  it('permite criar, editar, categorizar e excluir comandos', () => {
    const starter = createStarterPromptLibrary();
    const category = addPromptCategory(starter, 'Presentes', 'category-presentes');
    const created = addQuickCommand(category, {
      title: 'Nome em destaque',
      instruction: 'Deixe o nome como ponto focal da arte.',
      categoryId: 'category-presentes',
    }, 'command-nome');
    const updated = updateQuickCommand(created, 'command-nome', {
      title: 'Nome com destaque',
      instruction: 'Coloque o nome em destaque e mantenha margem segura.',
      categoryId: 'category-presentes',
    });
    const deleted = removeQuickCommand(updated, 'command-nome');

    expect(created.commands.find((command) => command.id === 'command-nome')?.categoryId).toBe('category-presentes');
    expect(updated.commands.find((command) => command.id === 'command-nome')?.title).toBe('Nome com destaque');
    expect(deleted.commands.some((command) => command.id === 'command-nome')).toBe(false);
  });

  it('renomeia categorias sem perder seus comandos e deixa os comandos sem categoria ao excluir', () => {
    const starter = createStarterPromptLibrary();
    const categoryId = starter.categories[0].id;
    const renamed = updatePromptCategory(starter, categoryId, 'Arte para presente');
    const removed = removePromptCategory(renamed, categoryId);

    expect(renamed.categories[0].name).toBe('Arte para presente');
    expect(removed.commands.filter((command) => command.categoryId === null).length).toBeGreaterThan(0);
  });

  it('impede categorias duplicadas ignorando maiúsculas e espaços externos', () => {
    const starter = createStarterPromptLibrary();

    expect(() => addPromptCategory(starter, `  ${starter.categories[0].name.toUpperCase()}  `)).toThrow();
  });

  it('junta anotações e comandos escolhidos dentro do limite aceito pela função de geração', () => {
    const notes = composePromptNotes('Fundo azul-marinho', [
      { id: 'a', title: 'Margens seguras', instruction: 'Preserve uma margem interna generosa.' },
      { id: 'b', title: 'Lateral orgânica', instruction: 'Estenda o fundo sem cortes retos.' },
    ]);

    expect(notes).toContain('Fundo azul-marinho');
    expect(notes).toContain('Margens seguras');
    expect(notes).toContain('Preserve uma margem interna generosa.');
    expect(notes.length).toBeLessThanOrEqual(MAX_PROMPT_NOTES_LENGTH);
    expect(composePromptNotes('', [{
      id: 'max', title: 'x'.repeat(80), instruction: 'y'.repeat(MAX_QUICK_COMMAND_INSTRUCTION_LENGTH),
    }]).length).toBeLessThanOrEqual(MAX_PROMPT_NOTES_LENGTH);
    expect(() => composePromptNotes('x'.repeat(MAX_PROMPT_NOTES_LENGTH), [
      { id: 'a', title: 'Extra', instruction: 'mais detalhes' },
    ])).toThrow();
  });

  it('salva e reabre a biblioteca sem enviar dados ao servidor', () => {
    const storage = memoryStorage();
    const starter = createStarterPromptLibrary();
    const category = addPromptCategory(starter, 'Datas especiais', 'datas-especiais');
    savePromptLibrary(category, storage);

    expect(loadPromptLibrary(storage)).toEqual(category);
  });
});
