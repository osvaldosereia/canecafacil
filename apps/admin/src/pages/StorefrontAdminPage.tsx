import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAdminAccessTokenFromLocation } from '../lib/admin-access';
import './StorefrontAdminPage.css';

type Contact = { name: string; email: string; whatsapp: string; customerId?: string | null };
type Asset = { version: number; variantIndex?: number; styleStrategy?: string; url: string | null; createdAt?: string | null; archivedAt?: string | null; deletedAt?: string | null };
type Mockup = { version: number; side: 'pair' | 'left' | 'right'; url: string | null };
type CustomerCreation = {
  projectId: string;
  title: string;
  status: string;
  createdAt: string;
  publicRequest?: { theme?: string; mugName?: string; name?: string; phrase?: string; generatedPhrase?: string; referenceTitle?: string; referenceCategory?: string; styleModelName?: string; styleModelCategory?: string; styleModelCategoryId?: string } | null;
  artVersions: Asset[];
  mockups: Mockup[];
};
type Printing = { approvedVersion: number | null; quantity: number; completed: number; status: 'not_queued' | 'ready' | 'printed' };
type Order = {
  projectId: string;
  title: string;
  status: string;
  customerContact: Contact | null;
  customerSavedVersion: number | null;
  customerSavedAt: string | null;
  orderStatus: string | null;
  adminNotes: string | null;
  publicRequest?: {
    text?: string;
    kind?: 'name' | 'phrase';
    theme?: string;
    mugName?: string;
    name?: string;
    phrase?: string;
    autoPhrase?: boolean;
    generatedPhrase?: string;
    generatedTheme?: string;
    referenceTitle?: string;
    referenceCategory?: string;
    styleModelName?: string;
    styleModelCategory?: string;
    styleModelCategoryId?: string;
  } | null;
  artVersions: Asset[];
  mockups: Mockup[];
  printing: Printing;
  createdAt: string;
};
type Customer = {
  id: string | null;
  name: string;
  email: string;
  whatsapp: string;
  orderCount: number;
  creationCount: number;
  artworkCount: number;
  lastOrderAt: string;
};
type CustomerArtworkPage = { creations: CustomerCreation[]; total: number; hasMore: boolean; nextOffset: number };
type ModelTheme = 'Pet' | 'Família' | 'Amigo';
type ModelCategory = { id: string; theme: ModelTheme; name: string; createdAt: string; imageCount: number };
type ModelImage = { id: string; categoryId: string; url: string; createdAt: string };
type ModelGallery = { categories: ModelCategory[]; models: ModelImage[] };
type Tab = 'orders' | 'customers' | 'models';

const orderStatuses = [
  ['new', 'Nova'],
  ['contacted', 'Contato feito'],
  ['confirmed', 'Confirmada'],
  ['in_production', 'Em produção'],
  ['ready', 'Pronta'],
  ['cancelled', 'Cancelada'],
] as const;

async function invoke<T>(client: SupabaseClient, body: Record<string, unknown> | FormData): Promise<T> {
  const accessToken = readAdminAccessTokenFromLocation();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['x-caneca-admin-link'] = accessToken;
  } else {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new Error('admin_auth_required');
    headers.Authorization = 'Bearer ' + session.access_token;
  }
  const { data, error } = await client.functions.invoke('caneca-studio', {
    body,
    headers,
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const result = await context.json() as { error?: string };
        if (result.error) throw new Error(result.error);
      } catch (reason) {
        if (reason instanceof Error && reason.message !== 'Unexpected end of JSON input') throw reason;
      }
    }
    throw new Error('studio_admin_request_failed');
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') throw new Error(data.error);
  return data as T;
}

function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'admin_auth_required' || code === 'admin_access_required') return 'Não foi possível abrir o painel. Atualize a página e tente novamente.';
  if (code === 'admin_access_unavailable') return 'Não foi possível verificar o acesso ao painel. Tente novamente mais tarde.';
  if (code === 'studio_customer_update_failed') return 'Não foi possível atualizar o cadastro do cliente.';
  if (code === 'style_model_category_exists') return 'Já existe uma categoria com esse nome para o tema selecionado.';
  if (code === 'style_model_category_not_empty') return 'Remova primeiro as imagens desta categoria.';
  if (code === 'style_model_image_too_large') return 'Uma imagem não pôde ser reduzida para o limite de 100 KB.';
  if (code === 'style_model_source_invalid') return 'Escolha imagens PNG, JPEG ou WebP de até 20 MB cada.';
  if (code === 'style_model_image_compression_failed') return 'O navegador não conseguiu preparar uma das imagens. Tente outro arquivo.';
  if (code === 'style_model_category_not_found') return 'A categoria selecionada não está mais disponível.';
  if (code === 'style_model_catalog_lookup_failed') return 'Não foi possível carregar a galeria de modelos.';
  return 'Não foi possível concluir esta ação. Atualize a página e tente novamente.';
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

const modelThemes: ModelTheme[] = ['Pet', 'Família', 'Amigo'];
const MODEL_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const MODEL_IMAGE_MAX_BYTES = 100_000;
const MODEL_UPLOAD_BATCH_SIZE = 20;

async function compressModelImage(file: File): Promise<File> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size <= 0 || file.size > MODEL_SOURCE_MAX_BYTES) {
    throw new Error('style_model_source_invalid');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('style_model_image_compression_failed');
    for (const maxEdge of [1600, 1200, 960, 800, 640, 520, 420]) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.72, 0.60, 0.50, 0.40]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= MODEL_IMAGE_MAX_BYTES) {
          return new File([blob], 'modelo.webp', { type: 'image/webp' });
        }
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error('style_model_image_too_large');
}

export function StorefrontAdminPage({ client }: { client: SupabaseClient }) {
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [modelTheme, setModelTheme] = useState<ModelTheme>('Pet');
  const [modelCategories, setModelCategories] = useState<ModelCategory[]>([]);
  const [modelCategoryId, setModelCategoryId] = useState('');
  const [modelCategoryName, setModelCategoryName] = useState('');
  const [modelImages, setModelImages] = useState<ModelImage[]>([]);
  const [modelGalleryLoading, setModelGalleryLoading] = useState(false);
  const [modelUploading, setModelUploading] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState('');
  const [modelDeletingId, setModelDeletingId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerArtworks, setCustomerArtworks] = useState<Record<string, CustomerArtworkPage>>({});
  const [loadingCustomerEmail, setLoadingCustomerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');


  async function loadModelGallery(categoryId?: string, themeOverride?: ModelTheme) {
    const selectedTheme = themeOverride || modelTheme;
    setModelGalleryLoading(true);
    setError('');
    try {
      let result = await invoke<ModelGallery>(client, {
        action: 'admin_models_list',
        ...(categoryId ? { categoryId } : {}),
      });
      const categories = result.categories || [];
      setModelCategories(categories);
      const rememberedCategory = categories.find((category) =>
        category.id === (categoryId || modelCategoryId) && category.theme === selectedTheme);
      const nextCategoryId = rememberedCategory?.id ||
        categories.find((category) => category.theme === selectedTheme)?.id || '';
      setModelCategoryId(nextCategoryId);
      if (nextCategoryId && nextCategoryId !== categoryId) {
        result = await invoke<ModelGallery>(client, { action: 'admin_models_list', categoryId: nextCategoryId });
        setModelCategories(result.categories || categories);
      }
      setModelImages(result.models || []);
    } catch (reason) {
      setError(errorMessage(reason));
      setModelImages([]);
    } finally {
      setModelGalleryLoading(false);
    }
  }

  async function createModelCategory() {
    const name = modelCategoryName.trim();
    if (name.length < 2 || name.length > 60) {
      setError('Digite um nome de categoria entre 2 e 60 caracteres.');
      return;
    }
    setSaving('model-category');
    setError('');
    setNotice('');
    try {
      const result = await invoke<{ category: ModelCategory }>(client, {
        action: 'admin_model_category_create',
        theme: modelTheme,
        name,
      });
      setModelCategoryName('');
      await loadModelGallery(result.category.id, modelTheme);
      setNotice('Categoria criada. Agora selecione as imagens para subir em lote.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving('');
    }
  }

  async function uploadModelImages(files: FileList | File[] | null) {
    const selectedFiles = Array.from(files || []);
    const categoryId = modelCategoryId;
    if (!selectedFiles.length) return;
    if (!categoryId) {
      setError('Crie ou selecione uma categoria antes de enviar as imagens.');
      return;
    }
    setModelUploading(true);
    setModelUploadProgress('');
    setError('');
    setNotice('');
    let uploadedCount = 0;
    const batchCount = Math.ceil(selectedFiles.length / MODEL_UPLOAD_BATCH_SIZE);
    try {
      for (let offset = 0; offset < selectedFiles.length; offset += MODEL_UPLOAD_BATCH_SIZE) {
        const batchIndex = Math.floor(offset / MODEL_UPLOAD_BATCH_SIZE) + 1;
        setModelUploadProgress('Preparando lote ' + batchIndex + ' de ' + batchCount + '…');
        const form = new FormData();
        form.set('action', 'admin_model_gallery_upload');
        form.set('categoryId', categoryId);
        const batch = selectedFiles.slice(offset, offset + MODEL_UPLOAD_BATCH_SIZE);
        for (const sourceFile of batch) {
          form.append('modelImages', await compressModelImage(sourceFile));
        }
        setModelUploadProgress('Enviando lote ' + batchIndex + ' de ' + batchCount + '…');
        const result = await invoke<{ added: number }>(client, form);
        uploadedCount += result.added || 0;
      }
      await loadModelGallery(categoryId, modelTheme);
      setNotice(uploadedCount + (uploadedCount === 1 ? ' imagem adicionada à galeria.' : ' imagens adicionadas à galeria.'));
    } catch (reason) {
      setError(errorMessage(reason));
      if (uploadedCount) setNotice(uploadedCount + ' imagens foram salvas antes da falha. Você pode enviar o restante novamente.');
    } finally {
      setModelUploading(false);
      setModelUploadProgress('');
    }
  }

  async function removeModelImage(image: ModelImage) {
    if (!window.confirm('Remover esta imagem da galeria?')) return;
    setModelDeletingId(image.id);
    setError('');
    setNotice('');
    try {
      await invoke(client, { action: 'admin_model_delete', modelId: image.id });
      await loadModelGallery(modelCategoryId, modelTheme);
      setNotice('Imagem removida da galeria.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setModelDeletingId(''); }
  }

  async function removeModelCategory(category: ModelCategory) {
    if (category.imageCount) return;
    if (!window.confirm('Remover a categoria “' + category.name + '” do tema ' + category.theme + '?')) return;
    setError('');
    setNotice('');
    try {
      await invoke(client, { action: 'admin_model_category_delete', categoryId: category.id });
      await loadModelGallery();
      setNotice('Categoria removida.');
    } catch (reason) { setError(errorMessage(reason)); }
  }

  async function loadCustomerArtworks(customer: Customer, append = false) {
    const email = customer.email.trim().toLowerCase();
    if (!email || loadingCustomerEmail === email) return;
    const current = customerArtworks[email];
    if (!append && current) return;
    setLoadingCustomerEmail(email);
    setError('');
    try {
      const page = await invoke<CustomerArtworkPage>(client, {
        action: 'admin_customer_artworks',
        email,
        offset: append ? current?.nextOffset || 0 : 0,
      });
      setCustomerArtworks((previous) => {
        const existing = append ? previous[email]?.creations || [] : [];
        return { ...previous, [email]: { ...page, creations: [...existing, ...(page.creations || [])] } };
      });
    } catch {
      setError('Não foi possível carregar as artes deste cliente.');
    } finally {
      setLoadingCustomerEmail('');
    }
  }

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [ordersResult, customersResult] = await Promise.all([
        invoke<{ orders: Order[] }>(client, { action: 'admin_orders' }),
        invoke<{ customers: Customer[] }>(client, { action: 'admin_customers' }),
      ]);
      setOrders(ordersResult.orders || []);
      setCustomers(customersResult.customers || []);
      setNotes(Object.fromEntries((ordersResult.orders || []).map((item) => [item.projectId, item.adminNotes || ''])));

    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, [client]);

  function replaceOrder(next: Order) {
    setOrders((current) => current.map((item) => item.projectId === next.projectId ? next : item));
    setNotes((current) => ({ ...current, [next.projectId]: next.adminNotes || '' }));
  }

  async function updateOrder(order: Order, status = order.orderStatus || 'new') {
    setSaving(order.projectId);
    setError('');
    setNotice('');
    try {
      const next = await invoke<Order>(client, {
        action: 'admin_update_order',
        jobId: order.projectId,
        orderStatus: status,
        adminNotes: notes[order.projectId] || '',
      });
      replaceOrder(next);
      setNotice('Solicitação atualizada.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(''); }
  }

  async function approvePrint(order: Order) {
    setSaving(order.projectId);
    setError('');
    try {
      const next = await invoke<Order>(client, {
        action: 'admin_approve_print',
        jobId: order.projectId,
        version: order.customerSavedVersion,
        quantity: 1,
      });
      replaceOrder(next);
      setNotice('Arte liberada para impressão.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(''); }
  }

  async function recordPrint(order: Order) {
    setSaving(order.projectId);
    setError('');
    try {
      const next = await invoke<Order>(client, { action: 'admin_record_print', jobId: order.projectId });
      replaceOrder(next);
      setNotice('Impressão registrada.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(''); }
  }

  async function saveCustomer(customer: Customer) {
    if (!customer.id) return;
    setSaving(customer.id);
    setError('');
    try {
      await invoke(client, { action: 'admin_update_customer', customerId: customer.id, name: customerName });
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, name: customerName.trim() } : item));
      setOrders((current) => current.map((order) => order.customerContact?.customerId === customer.id
        ? { ...order, customerContact: { ...order.customerContact, name: customerName.trim() } }
        : order));
      setEditingCustomer(null);
      setNotice('Cadastro do cliente atualizado.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(''); }
  }


  return (
    <section className="storefront-admin">
      <div className="storefront-admin-heading">
        <div><p className="storefront-admin-kicker">LOJA CANECAFÁCIL</p><h1>Atendimento e produção</h1><p>Gerencie criações, clientes, encomendas e impressão.</p></div>
        <button type="button" className="storefront-admin-refresh" onClick={() => { void loadData(); if (tab === 'models') void loadModelGallery(); }} disabled={loading || modelGalleryLoading}>Atualizar</button>
      </div>

      <nav className="storefront-admin-tabs" aria-label="Admin CanecaFácil">
        <button type="button" className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')}>Solicitações <b>{orders.length}</b></button>
        <button type="button" className={tab === 'customers' ? 'is-active' : ''} onClick={() => setTab('customers')}>Clientes <b>{customers.length}</b></button>
        <button type="button" className={tab === 'models' ? 'is-active' : ''} onClick={() => {
          setTab('models');
          void loadModelGallery();
        }}>Modelos de arte <b>{modelCategories.reduce((total, category) => total + category.imageCount, 0)}</b></button>
      </nav>
      <p className="storefront-retention-note">As artes ficam em resolução de impressão por 15 dias. Depois, o sistema remove os arquivos automaticamente; o cadastro e as anotações permanecem.</p>

      {error ? <p className="storefront-admin-alert" role="alert">{error}</p> : null}
      {notice ? <p className="storefront-admin-notice" role="status">{notice}</p> : null}
      {loading ? <p className="storefront-admin-empty">Carregando dados do CanecaFácil…</p> : null}

      {!loading && tab === 'orders' ? <div className="storefront-orders">
        {!orders.length ? <div className="storefront-admin-empty"><strong>Nenhuma solicitação salva ainda.</strong><span>As escolhas dos clientes aparecerão aqui.</span></div> : null}
        {orders.map((order) => {
          const version = order.customerSavedVersion || 0;
          const art = order.artVersions.find((item) => item.version === version);
          const mockup = order.mockups.find((item) => item.version === version && item.side === 'pair');
          const printing = order.printing || { approvedVersion: null, quantity: 1, completed: 0, status: 'not_queued' as const };
          const request = order.publicRequest;
          const requestName = request?.mugName || request?.name || (request?.kind === 'name' ? request.text : '');
          const requestPhrase = request?.autoPhrase
            ? request.generatedPhrase || ''
            : request?.phrase ?? (request?.kind === 'phrase' ? request.text : '');
          return <article className="storefront-order" key={order.projectId}>
            <div className="storefront-order-visual">
              {mockup?.url ? <img src={mockup.url} alt="Mockup escolhido pelo cliente" />
                : art?.url ? <img src={art.url} alt="Arte escolhida pelo cliente" />
                  : art ? <span className="storefront-order-expired">Arquivos expirados após 15 dias</span> : <span>☕</span>}
            </div>
            <div className="storefront-order-content">
              <div className="storefront-order-title"><div><small>Solicitação · {dateLabel(order.customerSavedAt || order.createdAt)}</small><h2>{order.title}</h2></div>
                <select aria-label="Status da solicitação" value={order.orderStatus || 'new'} disabled={saving === order.projectId}
                  onChange={(event) => void updateOrder(order, event.target.value)}>
                  {orderStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </div>
              {order.customerContact ? <div className="storefront-contact">
                <strong>{order.customerContact.name}</strong><a href={'mailto:' + order.customerContact.email}>{order.customerContact.email}</a>
                {order.customerContact.whatsapp ? <a href={'https://wa.me/' + order.customerContact.whatsapp.replace(/\D/g, '')} target="_blank" rel="noreferrer">WhatsApp {order.customerContact.whatsapp}</a> : <small>WhatsApp ainda não informado</small>}
              </div> : null}
              {request ? <div className="storefront-request-summary">
                <span>Personalização da arte</span>
                {requestName ? <strong>Nome: “{requestName}”</strong> : null}
                {requestPhrase ? <strong>{request.autoPhrase ? 'Frase criada pela IA' : 'Frase'}: “{requestPhrase}”</strong> : null}
                {!requestName && !requestPhrase ? <strong>Sem nome ou frase personalizada</strong> : null}
                <small>{request.theme ? 'Tema: ' + request.theme : request.generatedTheme ? 'Tema identificado: ' + request.generatedTheme : 'Arte personalizada'}{request.styleModelCategory ? ' · Categoria do modelo: ' + request.styleModelCategory : request.styleModelName ? ' · Modelo de arte: ' + request.styleModelName : ''}{request.referenceTitle ? ' · Inspiração antiga: ' + request.referenceTitle : ''}</small>
              </div> : null}
              {art?.url ? <div className="storefront-order-actions">
                <a className="storefront-admin-button is-secondary" href={art.url} download={'canecafacil-' + order.projectId + '-v' + version + '.webp'}>Baixar arte 2400 × 960</a>
                {printing.approvedVersion !== version ? <button className="storefront-admin-button" type="button" disabled={saving === order.projectId} onClick={() => void approvePrint(order)}>Liberar para impressão</button>
                  : <button className="storefront-admin-button" type="button" disabled={saving === order.projectId || printing.status === 'printed'} onClick={() => void recordPrint(order)}>
                    {printing.status === 'printed' ? 'Impressão registrada' : `Registrar impressão (${printing.completed}/${printing.quantity})`}
                  </button>}
              </div> : art ? <p className="storefront-art-expired">Arquivo de impressão removido após 15 dias. O registro do pedido foi mantido.</p> : null}
              <label className="storefront-notes">Anotações internas<textarea value={notes[order.projectId] ?? order.adminNotes ?? ''}
                onChange={(event) => setNotes((current) => ({ ...current, [order.projectId]: event.target.value }))} rows={2} placeholder="Observações para a equipe" /></label>
              <button className="storefront-save-note" type="button" disabled={saving === order.projectId} onClick={() => void updateOrder(order)}>
                {saving === order.projectId ? 'Salvando…' : 'Salvar atualização'}
              </button>
            </div>
          </article>;
        })}
      </div> : null}

      {!loading && tab === 'models' ? <div className="storefront-model-manager">
        <header className="storefront-model-manager-heading">
          <div><p className="storefront-admin-kicker">GALERIA PÚBLICA</p><h2>Modelos para inspirar as artes</h2>
            <p>Crie categorias por tema e envie várias imagens de uma vez. Cada imagem recebe um identificador automático; não precisa cadastrar nome individual.</p></div>
        </header>

        <section className="storefront-model-category-tools">
          <div className="storefront-model-category-form">
            <label>Tema da categoria<select value={modelTheme} disabled={modelUploading} onChange={(event) => {
              const nextTheme = event.target.value as ModelTheme;
              setModelTheme(nextTheme);
              setModelCategoryId('');
              setModelImages([]);
              void loadModelGallery(undefined, nextTheme);
            }}>{modelThemes.map((themeName) => <option key={themeName} value={themeName}>{themeName}</option>)}</select></label>
            <label>Nova categoria<input value={modelCategoryName} maxLength={60} onChange={(event) => setModelCategoryName(event.target.value)}
              placeholder={modelTheme === 'Pet' ? 'Ex.: Cães, gatos, aves' : modelTheme === 'Família' ? 'Ex.: Mãe, pai, avós' : 'Ex.: Melhores amigos'} /></label>
            <button type="button" className="storefront-admin-button" onClick={() => void createModelCategory()}
              disabled={saving === 'model-category' || modelUploading || modelCategoryName.trim().length < 2}>
              {saving === 'model-category' ? 'Criando…' : 'Criar categoria'}
            </button>
          </div>
          <div className="storefront-model-upload">
            <label>Categoria para as imagens<select value={modelCategoryId} disabled={modelUploading} onChange={(event) => {
              const nextId = event.target.value;
              setModelCategoryId(nextId);
              void loadModelGallery(nextId, modelTheme);
            }}>
              <option value="">Selecione uma categoria</option>
              {modelCategories.filter((category) => category.theme === modelTheme).map((category) =>
                <option key={category.id} value={category.id}>{category.name} ({category.imageCount})</option>)}
            </select></label>
            <label className="storefront-model-file">
              <span>{modelUploading ? modelUploadProgress || 'Enviando…' : 'Selecionar imagens de modelo'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!modelCategoryId || modelUploading}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files || []);
                  event.currentTarget.value = '';
                  void uploadModelImages(files);
                }} />
            </label>
            <small>PNG, JPEG ou WebP · até 20 MB por arquivo. O sistema converte para WebP com até 100 KB e gera os nomes automaticamente.</small>
          </div>
        </section>

        {modelGalleryLoading ? <p className="storefront-admin-empty">Carregando modelos…</p> : null}
        {!modelGalleryLoading && modelCategoryId && !modelImages.length
          ? <div className="storefront-admin-empty"><strong>Esta categoria ainda está vazia.</strong><span>Selecione imagens acima para preencher o carrossel público.</span></div> : null}
        {!modelGalleryLoading && !modelCategories.some((category) => category.theme === modelTheme)
          ? <div className="storefront-admin-empty"><strong>O tema ainda não tem categorias.</strong><span>Crie uma categoria para poder enviar imagens.</span></div> : null}
        {modelImages.length ? <div className="storefront-model-grid">
          {modelImages.map((image) => <article className="storefront-model-card" key={image.id}>
            <img src={image.url} alt={'Imagem de modelo da categoria ' + (modelCategories.find((category) => category.id === image.categoryId)?.name || '')} loading="lazy" />
            <button type="button" aria-label="Remover imagem de modelo" disabled={modelDeletingId === image.id || modelUploading}
              onClick={() => void removeModelImage(image)}>{modelDeletingId === image.id ? 'Removendo…' : 'Remover imagem'}</button>
          </article>)}
        </div> : null}
        {modelCategories.filter((category) => category.theme === modelTheme && category.imageCount === 0).length
          ? <div className="storefront-model-empty-categories"><strong>Categorias vazias</strong>
            {modelCategories.filter((category) => category.theme === modelTheme && category.imageCount === 0).map((category) =>
              <button type="button" key={category.id} onClick={() => void removeModelCategory(category)}>Remover {category.name}</button>)}
          </div> : null}
      </div> : null}

      {!loading && tab === 'customers' ? <div className="storefront-customer-list">
        {!customers.length ? <div className="storefront-admin-empty"><strong>Nenhum cliente ainda.</strong><span>O cadastro aparece assim que a pessoa gera sua primeira arte com nome e e-mail.</span></div> : null}
        {customers.map((customer, index) => <article className="storefront-customer" key={customer.id || customer.email || index}>
          <div className="storefront-customer-avatar" aria-hidden="true">{customer.name.trim().charAt(0).toUpperCase() || 'C'}</div>
          <div className="storefront-customer-details">{editingCustomer === customer.id ? <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} aria-label="Nome do cliente" /> : <strong>{customer.name || 'Cliente'}</strong>}
            <span>{customer.email}</span>
            {customer.whatsapp ? <a href={'https://wa.me/' + customer.whatsapp.replace(/\D/g, '')} target="_blank" rel="noreferrer">{customer.whatsapp}</a> : <small>WhatsApp ainda não informado</small>}
          </div>
          <div className="storefront-customer-meta">
            <strong>{customer.artworkCount} {customer.artworkCount === 1 ? 'arte' : 'artes'}</strong>
            <span>{customer.creationCount} {customer.creationCount === 1 ? 'criação' : 'criações'}</span>
            <span>Última: {dateLabel(customer.lastOrderAt)}</span>
          </div>
          {customer.id ? editingCustomer === customer.id ? <div className="storefront-customer-actions"><button type="button" onClick={() => void saveCustomer(customer)} disabled={saving === customer.id}>Salvar</button><button type="button" onClick={() => setEditingCustomer(null)}>Cancelar</button></div>
            : <button type="button" className="storefront-save-note" onClick={() => { setEditingCustomer(customer.id); setCustomerName(customer.name); }}>Editar cadastro</button> : null}
          {customer.creationCount ? <details className="storefront-customer-artworks" onToggle={(event) => {
            if (event.currentTarget.open) void loadCustomerArtworks(customer);
          }}>
            <summary>Ver artes e mockups ({customer.artworkCount})</summary>
            {loadingCustomerEmail === customer.email.trim().toLowerCase() && !customerArtworks[customer.email.trim().toLowerCase()] ? <p className="storefront-customer-art-loading">Carregando artes…</p> : null}
            <div className="storefront-customer-artwork-list">
              {(customerArtworks[customer.email.trim().toLowerCase()]?.creations || []).map((creation) => <section className="storefront-customer-creation" key={creation.projectId}>
                <div className="storefront-customer-creation-heading">
                  <strong>{creation.title}</strong><span>{dateLabel(creation.createdAt)} · {creation.publicRequest?.theme || creation.publicRequest?.referenceTitle || 'Arte personalizada'}</span>
                </div>
                <div className="storefront-customer-creation-assets">
                  {creation.artVersions.map((art) => art.url
                    ? <a className="storefront-customer-art-link" key={'art-' + art.version} href={art.url} target="_blank" rel="noreferrer">
                      <img src={art.url} alt={'Arte horizontal, versão ' + art.version} loading="lazy" />
                      <span>Arte horizontal · v{art.version}</span>
                    </a>
                    : <span className="storefront-customer-art-expired" key={'art-' + art.version}>Arte v{art.version} · arquivo expirado</span>)}
                  {creation.mockups.filter((mockup) => mockup.side === 'pair').map((mockup) => mockup.url
                    ? <a className="storefront-customer-art-link is-square" key={'mockup-' + mockup.version} href={mockup.url} target="_blank" rel="noreferrer">
                      <img src={mockup.url} alt="Mockup quadrado com os dois lados da caneca" loading="lazy" />
                      <span>Mockup quadrado · v{mockup.version}</span>
                    </a>
                    : <span className="storefront-customer-art-expired" key={'mockup-' + mockup.version}>Mockup · arquivo expirado</span>)}
                </div>
              </section>)}
            </div>
            {loadingCustomerEmail === customer.email.trim().toLowerCase() && customerArtworks[customer.email.trim().toLowerCase()] ? <p className="storefront-customer-art-loading">Carregando mais artes…</p> : null}
            {customerArtworks[customer.email.trim().toLowerCase()]?.hasMore ? <button className="storefront-customer-load-more" type="button"
              disabled={loadingCustomerEmail === customer.email.trim().toLowerCase()}
              onClick={() => void loadCustomerArtworks(customer, true)}>Carregar mais artes</button> : null}
          </details> : null}
        </article>)}
      </div> : null}


    </section>
  );
}
