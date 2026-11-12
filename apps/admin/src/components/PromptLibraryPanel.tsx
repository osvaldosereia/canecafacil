import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  addPromptCategory,
  addQuickCommand,
  composePromptNotes,
  loadPromptLibrary,
  MAX_QUICK_COMMAND_INSTRUCTION_LENGTH,
  parsePromptLibrary,
  removePromptCategory,
  removeQuickCommand,
  savePromptLibrary,
  updatePromptCategory,
  updateQuickCommand,
  type PromptCategory,
  type PromptLibrary,
  type QuickPromptCommand,
} from '../lib/prompt-library';

interface PromptLibraryPanelProps {
  selectedCommands: QuickPromptCommand[];
  onSelectedCommandsChange: (commands: QuickPromptCommand[]) => void;
}

const UNCATEGORIZED = '__uncategorized__';
const MAX_VISIBLE_COMMANDS = 100;

export function PromptLibraryPanel({ selectedCommands, onSelectedCommandsChange }: PromptLibraryPanelProps) {
  const [library, setLibrary] = useState<PromptLibrary>(() => loadPromptLibrary());
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCommandEditor, setShowCommandEditor] = useState(false);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [commandTitle, setCommandTitle] = useState('');
  const [commandInstruction, setCommandInstruction] = useState('');
  const [commandCategoryId, setCommandCategoryId] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStorageAvailable(savePromptLibrary(library));
  }, [library]);

  useEffect(() => {
    const commandsById = new Map(library.commands.map((command) => [command.id, command]));
    const restored = selectedCommands.map((command) => commandsById.get(command.id) ?? command);
    const changed = restored.some((command, index) => {
      const selected = selectedCommands[index];
      return !selected || command.title !== selected.title || command.instruction !== selected.instruction ||
        command.categoryId !== selected.categoryId;
    });
    if (changed) onSelectedCommandsChange(restored);
  }, [library, onSelectedCommandsChange, selectedCommands]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const command of library.commands) {
      const id = command.categoryId ?? UNCATEGORIZED;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [library.commands]);

  const filteredCommands = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return library.commands.filter((command) => {
      const inCategory = categoryFilter === 'all' ||
        (categoryFilter === UNCATEGORIZED ? command.categoryId === null : command.categoryId === categoryFilter);
      const matchesSearch = !term || `${command.title} ${command.instruction}`.toLocaleLowerCase('pt-BR').includes(term);
      return inCategory && matchesSearch;
    });
  }, [categoryFilter, library.commands, query]);

  const visibleCommands = filteredCommands.slice(0, MAX_VISIBLE_COMMANDS);
  const orderedCategories = [...library.categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const selectedIds = new Set(selectedCommands.map((command) => command.id));
  const selectedNotesLength = composePromptNotes('', selectedCommands).length;

  function setFeedbackMessage(kind: 'success' | 'error', text: string) {
    setFeedback({ kind, text });
  }

  function saveSelection(nextIds: Set<string>) {
    const commandsById = new Map(library.commands.map((command) => [command.id, command]));
    const selectedById = new Map(selectedCommands.map((command) => [command.id, command]));
    const nextCommands = [...nextIds]
      .map((id) => commandsById.get(id) ?? selectedById.get(id))
      .filter((command): command is QuickPromptCommand => command !== undefined);
    try {
      composePromptNotes('', nextCommands);
      onSelectedCommandsChange(nextCommands);
      setFeedback(null);
    } catch (cause) {
      setFeedbackMessage('error', cause instanceof Error ? cause.message : 'Selecione menos comandos.');
    }
  }

  function toggleCommand(command: QuickPromptCommand, checked: boolean) {
    const nextIds = new Set(selectedIds);
    if (checked) nextIds.add(command.id);
    else nextIds.delete(command.id);
    saveSelection(nextIds);
  }

  function clearCommandEditor() {
    setShowCommandEditor(false);
    setEditingCommandId(null);
    setCommandTitle('');
    setCommandInstruction('');
    setCommandCategoryId('');
  }

  function beginNewCommand() {
    setEditingCommandId(null);
    setCommandTitle('');
    setCommandInstruction('');
    setCommandCategoryId(orderedCategories[0]?.id ?? '');
    setShowCommandEditor(true);
    setFeedback(null);
  }

  function beginEditCommand(command: QuickPromptCommand) {
    setEditingCommandId(command.id);
    setCommandTitle(command.title);
    setCommandInstruction(command.instruction);
    setCommandCategoryId(command.categoryId ?? orderedCategories[0]?.id ?? '');
    setShowCommandEditor(true);
    setFeedback(null);
  }

  function saveCommand() {
    try {
      const draft = { title: commandTitle, instruction: commandInstruction, categoryId: commandCategoryId || null };
      const next = editingCommandId
        ? updateQuickCommand(library, editingCommandId, draft)
        : addQuickCommand(library, draft);
      let removedFromSelection = false;
      if (editingCommandId && selectedIds.has(editingCommandId)) {
        const nextSelection = next.commands.filter((command) => selectedIds.has(command.id));
        try {
          composePromptNotes('', nextSelection);
        } catch {
          onSelectedCommandsChange(selectedCommands.filter((command) => command.id !== editingCommandId));
          removedFromSelection = true;
        }
      }
      setLibrary(next);
      clearCommandEditor();
      setFeedbackMessage('success', removedFromSelection
        ? 'Comando atualizado e retirado da seleção atual para respeitar o limite do briefing.'
        : editingCommandId ? 'Comando atualizado.' : 'Comando salvo na biblioteca.');
    } catch (cause) {
      setFeedbackMessage('error', cause instanceof Error ? cause.message : 'Não foi possível salvar o comando.');
    }
  }

  function deleteCommand(command: QuickPromptCommand) {
    if (!window.confirm(`Excluir o comando “${command.title}”?`)) return;
    setLibrary((current) => removeQuickCommand(current, command.id));
    onSelectedCommandsChange(selectedCommands.filter((selected) => selected.id !== command.id));
    if (editingCommandId === command.id) clearCommandEditor();
    setFeedbackMessage('success', 'Comando excluído.');
  }

  function createCategory() {
    try {
      setLibrary(addPromptCategory(library, categoryName));
      setCategoryName('');
      setFeedbackMessage('success', 'Categoria criada.');
    } catch (cause) {
      setFeedbackMessage('error', cause instanceof Error ? cause.message : 'Não foi possível criar a categoria.');
    }
  }

  function renameCategory(category: PromptCategory) {
    try {
      setLibrary(updatePromptCategory(library, category.id, editingCategoryName));
      setEditingCategoryId(null);
      setEditingCategoryName('');
      setFeedbackMessage('success', 'Categoria atualizada.');
    } catch (cause) {
      setFeedbackMessage('error', cause instanceof Error ? cause.message : 'Não foi possível atualizar a categoria.');
    }
  }

  function deleteCategory(category: PromptCategory) {
    const count = categoryCounts.get(category.id) ?? 0;
    const impact = count ? ` Os ${count} comando(s) serão mantidos como “Sem categoria”.` : '';
    if (!window.confirm(`Excluir a categoria “${category.name}”?${impact}`)) return;
    setLibrary((current) => removePromptCategory(current, category.id));
    if (categoryFilter === category.id) setCategoryFilter('all');
    if (commandCategoryId === category.id) setCommandCategoryId('');
    if (editingCategoryId === category.id) setEditingCategoryId(null);
    setFeedbackMessage('success', 'Categoria excluída; os comandos foram mantidos.');
  }

  function exportLibrary() {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'caneca-360-comandos.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setFeedbackMessage('success', 'Cópia da biblioteca exportada.');
  }

  async function importLibrary(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 2_000_000) {
      setFeedbackMessage('error', 'O arquivo deve ter até 2 MB.');
      return;
    }
    try {
      const imported = parsePromptLibrary(JSON.parse(await file.text()));
      if (!imported) throw new Error('O arquivo não contém uma biblioteca válida do Caneca 360.');
      if (!window.confirm(`Substituir a biblioteca atual por ${imported.categories.length} categorias e ${imported.commands.length} comandos?`)) return;
      setLibrary(imported);
      onSelectedCommandsChange([]);
      setCategoryFilter('all');
      setQuery('');
      setFeedbackMessage('success', 'Biblioteca importada.');
    } catch (cause) {
      setFeedbackMessage('error', cause instanceof Error ? cause.message : 'Não foi possível importar esse arquivo.');
    }
  }

  return (
    <section className="studio-card studio-prompt-library" aria-labelledby="studio-prompt-library-title"
      onKeyDownCapture={(event) => {
        const target = event.target;
        if (event.key === 'Enter' && target instanceof HTMLInputElement &&
          !['checkbox', 'file', 'button', 'submit'].includes(target.type)) {
          event.preventDefault();
        }
      }}>
      <div className="studio-card-title compact-title">
        <span className="studio-step muted">✳</span>
        <div>
          <h2 id="studio-prompt-library-title">Comandos rápidos</h2>
          <p>Combine instruções salvas com o briefing antes de gerar.</p>
        </div>
      </div>

      <div className="studio-prompt-selected" aria-live="polite">
        <div className="studio-prompt-selected-heading">
          <strong>{selectedCommands.length} selecionado{selectedCommands.length === 1 ? '' : 's'} · {selectedNotesLength}/1000 caracteres</strong>
          {selectedCommands.length ? <button className="studio-link-button" type="button" onClick={() => onSelectedCommandsChange([])}>Limpar seleção</button> : null}
        </div>
        {selectedCommands.length ? (
          <div className="studio-prompt-chips">
            {selectedCommands.map((command) => (
              <button className="studio-prompt-chip" type="button" key={command.id}
                aria-label={`Remover ${command.title} da seleção`}
                onClick={() => toggleCommand(command, false)}>
                {command.title}<span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : <p className="studio-prompt-empty-selection">Nenhum comando selecionado. As instruções salvas só entram no prompt quando você as escolhe.</p>}
      </div>

      <div className="studio-prompt-filters">
        <label className="studio-field">
          <span>Buscar comandos</span>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Ex.: margem, aquarela, texto…" />
        </label>
        <label className="studio-field">
          <span>Categoria</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.currentTarget.value)}>
            <option value="all">Todas ({library.commands.length})</option>
            {orderedCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({categoryCounts.get(category.id) ?? 0})
              </option>
            ))}
            {categoryCounts.has(UNCATEGORIZED) ? <option value={UNCATEGORIZED}>Sem categoria ({categoryCounts.get(UNCATEGORIZED)})</option> : null}
          </select>
        </label>
      </div>

      <div className="studio-prompt-list" aria-label="Comandos salvos">
        {visibleCommands.length ? visibleCommands.map((command) => (
          <article className={'studio-prompt-command' + (selectedIds.has(command.id) ? ' is-selected' : '')} key={command.id}>
            <label className="studio-prompt-command-pick">
              <input type="checkbox" checked={selectedIds.has(command.id)}
                onChange={(event) => toggleCommand(command, event.currentTarget.checked)} />
              <span><strong>{command.title}</strong><small>{command.instruction}</small></span>
            </label>
            <div className="studio-prompt-command-actions">
              <button className="studio-link-button" type="button" onClick={() => beginEditCommand(command)}>Editar</button>
              <button className="studio-link-button is-danger" type="button" onClick={() => deleteCommand(command)}>Excluir</button>
            </div>
          </article>
        )) : <p className="studio-prompt-no-results">Nenhum comando encontrado. Tente outra busca ou crie um novo.</p>}
      </div>
      {filteredCommands.length > MAX_VISIBLE_COMMANDS ? (
        <p className="studio-prompt-count">Mostrando {MAX_VISIBLE_COMMANDS} de {filteredCommands.length}. Digite mais para filtrar.</p>
      ) : <p className="studio-prompt-count">{filteredCommands.length} comando(s) nesta lista</p>}

      <div className="studio-prompt-toolbar">
        <button className="studio-quiet-button" type="button" onClick={beginNewCommand}>+ Novo comando</button>
        <button className="studio-quiet-button" type="button" onClick={() => setShowCategoryManager((value) => !value)}>
          {showCategoryManager ? 'Fechar categorias' : `Categorias (${library.categories.length})`}
        </button>
      </div>

      {showCommandEditor ? (
        <div className="studio-prompt-editor" aria-label={editingCommandId ? 'Editar comando rápido' : 'Criar comando rápido'}>
          <h3>{editingCommandId ? 'Editar comando' : 'Novo comando'}</h3>
          <label className="studio-field"><span>Nome curto</span>
            <input value={commandTitle} maxLength={80} onChange={(event) => setCommandTitle(event.currentTarget.value)} placeholder="Ex.: Nome com destaque" />
          </label>
          <label className="studio-field"><span>Categoria</span>
            <select value={commandCategoryId} onChange={(event) => setCommandCategoryId(event.currentTarget.value)}>
              <option value="">Selecione uma categoria</option>
              {orderedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="studio-field"><span>Instrução para a arte</span>
            <textarea value={commandInstruction} maxLength={MAX_QUICK_COMMAND_INSTRUCTION_LENGTH} rows={4}
              onChange={(event) => setCommandInstruction(event.currentTarget.value)}
              placeholder="Escreva uma orientação clara que será acrescentada ao prompt da OpenAI." />
            <small>{commandInstruction.length}/{MAX_QUICK_COMMAND_INSTRUCTION_LENGTH} caracteres</small>
          </label>
          <div className="studio-prompt-toolbar">
            <button className="studio-secondary" type="button" onClick={saveCommand}>Salvar comando</button>
            <button className="studio-link-button" type="button" onClick={clearCommandEditor}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {showCategoryManager ? (
        <div className="studio-prompt-category-manager">
          <h3>Organizar categorias</h3>
          <div className="studio-prompt-category-create">
            <input value={categoryName} maxLength={60} onChange={(event) => setCategoryName(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); createCategory(); } }}
              placeholder="Nome da nova categoria" aria-label="Nome da nova categoria" />
            <button className="studio-secondary" type="button" onClick={createCategory}>Criar</button>
          </div>
          <ul className="studio-prompt-category-list">
            {orderedCategories.map((category) => (
              <li key={category.id}>
                {editingCategoryId === category.id ? <>
                  <input value={editingCategoryName} maxLength={60} autoFocus
                    onChange={(event) => setEditingCategoryName(event.currentTarget.value)}
                    aria-label={`Novo nome para ${category.name}`} />
                  <button className="studio-link-button" type="button" onClick={() => renameCategory(category)}>Salvar</button>
                  <button className="studio-link-button" type="button" onClick={() => setEditingCategoryId(null)}>Cancelar</button>
                </> : <>
                  <span><strong>{category.name}</strong><small>{categoryCounts.get(category.id) ?? 0} comandos</small></span>
                  <button className="studio-link-button" type="button" onClick={() => {
                    setEditingCategoryId(category.id); setEditingCategoryName(category.name); setFeedback(null);
                  }}>Renomear</button>
                  <button className="studio-link-button is-danger" type="button" onClick={() => deleteCategory(category)}>Excluir</button>
                </>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="studio-prompt-backup">
        <div>
          <strong>Cópia e armazenamento</strong>
          <small>{storageAvailable === false
            ? 'O navegador não permitiu salvar automaticamente. Exporte uma cópia para não perder as alterações.'
            : 'Salvo automaticamente neste navegador. Exporte para guardar ou transferir para outro dispositivo.'}</small>
        </div>
        <div className="studio-prompt-toolbar">
          <button className="studio-link-button" type="button" onClick={exportLibrary}>Exportar</button>
          <button className="studio-link-button" type="button" onClick={() => importInputRef.current?.click()}>Importar</button>
          <input ref={importInputRef} className="studio-sr-only" type="file" accept="application/json,.json" onChange={(event) => void importLibrary(event)} />
        </div>
      </div>
      {feedback ? <p className={'studio-prompt-feedback ' + feedback.kind} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p> : null}
    </section>
  );
}
