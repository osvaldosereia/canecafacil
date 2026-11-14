import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './StorefrontAdminPage.css';

type Contact = { name: string; email: string; whatsapp: string; customerId?: string | null };
type Asset = { version: number; variantIndex?: number; url: string; createdAt?: string | null; archivedAt?: string | null };
type Mockup = { version: number; side: 'pair' | 'left' | 'right'; url: string };
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
  publicRequest?: { text: string; kind: 'name' | 'phrase'; referenceTitle: string; referenceCategory: string } | null;
  artVersions: Asset[];
  mockups: Mockup[];
  printing: Printing;
  createdAt: string;
};
type Customer = { id: string | null; name: string; email: string; whatsapp: string; orderCount: number; lastOrderAt: string };
type Reference = { id: string; title: string; category: string; url: string };
type Tab = 'orders' | 'customers' | 'references';

const orderStatuses = [
  ['new', 'Nova'],
  ['contacted', 'Contato feito'],
  ['confirmed', 'Confirmada'],
  ['in_production', 'Em produção'],
  ['ready', 'Pronta'],
  ['cancelled', 'Cancelada'],
] as const;

async function invoke<T>(client: SupabaseClient, body: Record<string, unknown> | FormData): Promise<T> {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('admin_auth_required');
  const { data, error } = await client.functions.invoke('caneca-studio', {
    body,
    headers: { Authorization: 'Bearer ' + session.access_token },
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
  if (code === 'admin_auth_required' || code === 'admin_access_required') return 'Entre novamente com uma conta administradora.';
  if (code === 'studio_customer_update_failed') return 'Não foi possível atualizar o cadastro do cliente.';
  if (code === 'studio_catalog_save_failed') return 'Não foi possível salvar a imagem de referência.';
  return 'Não foi possível concluir esta ação. Atualize a página e tente novamente.';
}

async function compressReference(file: File): Promise<File> {
  const image = await createImageBitmap(file);
  const ratio = Math.min(1, 1000 / image.width, 1000 / image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('reference_compression_failed');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.22]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= 100_000) return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  }
  throw new Error('reference_compression_failed');
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

export function StorefrontAdminPage({ client }: { client: SupabaseClient }) {
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [referenceTitle, setReferenceTitle] = useState('');
  const [referenceCategory, setReferenceCategory] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const archiving = useRef(false);

  async function compressArtwork(blob: Blob): Promise<File> {
    const image = await createImageBitmap(blob);
    if (image.width !== 2400 || image.height !== 960) {
      image.close();
      throw new Error('archive_dimensions_invalid');
    }
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 960;
    const context = canvas.getContext('2d');
    if (!context) { image.close(); throw new Error('archive_compression_failed'); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    for (const quality of [0.64, 0.56, 0.48, 0.4, 0.32, 0.24]) {
      const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (result && result.size <= 300_000) return new File([result], 'caneca-arte-arquivada.webp', { type: 'image/webp' });
    }
    throw new Error('archive_compression_failed');
  }

  async function archiveOldArtwork() {
    if (archiving.current) return;
    archiving.current = true;
    let archivedCount = 0;
    try {
      for (let batch = 0; batch < 20; batch++) {
        const { candidates } = await invoke<{ candidates: Array<{ jobId: string; version: number; url: string; createdAt: string }> }>(client, { action: 'admin_archive_candidates' });
        if (!candidates?.length) break;
        const eligible = candidates.filter((item) => Date.now() - Date.parse(item.createdAt) >= 30 * 24 * 60 * 60 * 1000);
        if (!eligible.length) break;
        const item = eligible[0];
        const response = await fetch(item.url, { credentials: 'omit' });
        if (!response.ok) break;
        const compressed = await compressArtwork(await response.blob());
        const form = new FormData();
        form.set('action', 'admin_archive_art');
        form.set('jobId', item.jobId);
        form.set('version', String(item.version));
        form.set('archiveArt', compressed);
        await invoke(client, form);
        archivedCount += 1;
      }
      if (archivedCount) setNotice(`${archivedCount} arte${archivedCount === 1 ? '' : 's'} com mais de 30 dias foi${archivedCount === 1 ? '' : 'ram'} compactada${archivedCount === 1 ? '' : 's'} para arquivo.`);
    } catch {
      // A falha é recuperada na próxima abertura do painel; o original permanece no armazenamento.
    } finally {
      archiving.current = false;
    }
  }

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [ordersResult, customersResult, referencesResult] = await Promise.all([
        invoke<{ orders: Order[] }>(client, { action: 'admin_orders' }),
        invoke<{ customers: Customer[] }>(client, { action: 'admin_customers' }),
        invoke<{ items: Reference[] }>(client, { action: 'admin_catalog_list' }),
      ]);
      setOrders(ordersResult.orders || []);
      setCustomers(customersResult.customers || []);
      setReferences(referencesResult.items || []);
      setNotes(Object.fromEntries((ordersResult.orders || []).map((item) => [item.projectId, item.adminNotes || ''])));
      void archiveOldArtwork();
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

  async function uploadReference(event: ChangeEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!referenceFile || !referenceTitle.trim() || !referenceCategory.trim()) return;
    setSaving('reference');
    setError('');
    setNotice('');
    try {
      const compressed = await compressReference(referenceFile);
      const form = new FormData();
      form.set('action', 'admin_catalog_upload');
      form.set('title', referenceTitle.trim());
      form.set('category', referenceCategory.trim());
      form.set('image', compressed);
      const result = await invoke<{ items: Reference[] }>(client, form);
      setReferences(result.items || []);
      setReferenceTitle('');
      setReferenceCategory('');
      setReferenceFile(null);
      formElement.reset();
      setNotice('Imagem adicionada à galeria pública. Arquivo WebP: ' + Math.ceil(compressed.size / 1024) + ' KB.');
    } catch (reason) { setError(reason instanceof Error && reason.message === 'reference_compression_failed'
      ? 'A imagem não coube em 100 KB mesmo após a compactação.'
      : errorMessage(reason)); }
    finally { setSaving(''); }
  }

  async function deleteReference(reference: Reference) {
    setSaving(reference.id);
    setError('');
    try {
      const result = await invoke<{ items: Reference[] }>(client, { action: 'admin_catalog_delete', id: reference.id });
      setReferences(result.items || []);
      setNotice('Imagem removida da galeria.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(''); }
  }

  return (
    <section className="storefront-admin">
      <div className="storefront-admin-heading">
        <div><p className="storefront-admin-kicker">LOJA CANECAFÁCIL</p><h1>Atendimento e produção</h1><p>Gerencie as artes escolhidas, clientes e imagens de inspiração.</p></div>
        <button type="button" className="storefront-admin-refresh" onClick={() => void loadData()} disabled={loading}>Atualizar</button>
      </div>

      <nav className="storefront-admin-tabs" aria-label="Admin CanecaFácil">
        <button type="button" className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')}>Solicitações <b>{orders.length}</b></button>
        <button type="button" className={tab === 'customers' ? 'is-active' : ''} onClick={() => setTab('customers')}>Clientes <b>{customers.length}</b></button>
        <button type="button" className={tab === 'references' ? 'is-active' : ''} onClick={() => setTab('references')}>Referências <b>{references.length}</b></button>
      </nav>
      <p className="storefront-retention-note">As artes ficam em resolução de impressão por 30 dias. Depois, o painel compacta os arquivos antigos ao ser aberto.</p>

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
          return <article className="storefront-order" key={order.projectId}>
            <div className="storefront-order-visual">
              {mockup ? <img src={mockup.url} alt="Mockup escolhido pelo cliente" /> : art ? <img src={art.url} alt="Arte escolhida pelo cliente" /> : <span>☕</span>}
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
                <a href={'https://wa.me/' + order.customerContact.whatsapp.replace(/\D/g, '')} target="_blank" rel="noreferrer">WhatsApp {order.customerContact.whatsapp}</a>
              </div> : null}
              {order.publicRequest ? <div className="storefront-request-summary">
                <span>{order.publicRequest.kind === 'name' ? 'Nome escolhido' : 'Frase escolhida'}</span><strong>“{order.publicRequest.text}”</strong>
                <small>Inspiração: {order.publicRequest.referenceTitle} · {order.publicRequest.referenceCategory}</small>
              </div> : null}
              {art ? <div className="storefront-order-actions">
                <a className="storefront-admin-button is-secondary" href={art.url} download={'canecafacil-' + order.projectId + '-v' + version + '.webp'}>Baixar arte 2400 × 960</a>
                {printing.approvedVersion !== version ? <button className="storefront-admin-button" type="button" disabled={saving === order.projectId} onClick={() => void approvePrint(order)}>Liberar para impressão</button>
                  : <button className="storefront-admin-button" type="button" disabled={saving === order.projectId || printing.status === 'printed'} onClick={() => void recordPrint(order)}>
                    {printing.status === 'printed' ? 'Impressão registrada' : `Registrar impressão (${printing.completed}/${printing.quantity})`}
                  </button>}
              </div> : null}
              <label className="storefront-notes">Anotações internas<textarea value={notes[order.projectId] ?? order.adminNotes ?? ''}
                onChange={(event) => setNotes((current) => ({ ...current, [order.projectId]: event.target.value }))} rows={2} placeholder="Observações para a equipe" /></label>
              <button className="storefront-save-note" type="button" disabled={saving === order.projectId} onClick={() => void updateOrder(order)}>
                {saving === order.projectId ? 'Salvando…' : 'Salvar atualização'}
              </button>
            </div>
          </article>;
        })}
      </div> : null}

      {!loading && tab === 'customers' ? <div className="storefront-customer-list">
        {!customers.length ? <div className="storefront-admin-empty"><strong>Nenhum cliente ainda.</strong><span>O cadastro aparece após a primeira geração de mockup e arte salva.</span></div> : null}
        {customers.map((customer, index) => <article className="storefront-customer" key={customer.id || customer.whatsapp + index}>
          <div className="storefront-customer-avatar" aria-hidden="true">{customer.name.trim().charAt(0).toUpperCase() || 'C'}</div>
          <div className="storefront-customer-details">{editingCustomer === customer.id ? <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} aria-label="Nome do cliente" /> : <strong>{customer.name}</strong>}
            <span>{customer.email}</span><a href={'https://wa.me/' + customer.whatsapp.replace(/\D/g, '')} target="_blank" rel="noreferrer">{customer.whatsapp}</a></div>
          <div className="storefront-customer-meta"><strong>{customer.orderCount} {customer.orderCount === 1 ? 'solicitação' : 'solicitações'}</strong><span>Última: {dateLabel(customer.lastOrderAt)}</span></div>
          {customer.id ? editingCustomer === customer.id ? <div className="storefront-customer-actions"><button type="button" onClick={() => void saveCustomer(customer)} disabled={saving === customer.id}>Salvar</button><button type="button" onClick={() => setEditingCustomer(null)}>Cancelar</button></div>
            : <button type="button" className="storefront-save-note" onClick={() => { setEditingCustomer(customer.id); setCustomerName(customer.name); }}>Editar cadastro</button> : null}
        </article>)}
      </div> : null}

      {!loading && tab === 'references' ? <div className="storefront-reference-manager">
        <form className="storefront-reference-form" onSubmit={(event) => void uploadReference(event)}>
          <div><p className="storefront-admin-kicker">GALERIA PÚBLICA</p><h2>Adicionar imagem de inspiração</h2><p>As imagens enviadas são convertidas para WebP e ficam limitadas a 100 KB.</p></div>
          <div className="storefront-reference-fields">
            <label>Nome da referência<input value={referenceTitle} onChange={(event) => setReferenceTitle(event.target.value)} required maxLength={120} placeholder="Ex.: Rosas delicadas" /></label>
            <label>Categoria<input value={referenceCategory} onChange={(event) => setReferenceCategory(event.target.value)} required maxLength={80} placeholder="Ex.: Floral" /></label>
            <label className="storefront-file-input">Imagem<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setReferenceFile(event.target.files?.[0] || null)} required /></label>
          </div>
          <button type="submit" className="storefront-admin-button" disabled={saving === 'reference' || !referenceFile}>{saving === 'reference' ? 'Compactando e enviando…' : 'Adicionar à galeria'}</button>
        </form>
        <div className="storefront-reference-grid">{references.map((reference) => <article className="storefront-reference" key={reference.id}>
          <img src={reference.url} alt={reference.title} /><div><strong>{reference.title}</strong><small>{reference.category}</small></div>
          <button type="button" onClick={() => void deleteReference(reference)} disabled={saving === reference.id}>Remover</button>
        </article>)}</div>
      </div> : null}
    </section>
  );
}
