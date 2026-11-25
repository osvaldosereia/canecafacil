"use client";

import { FormEvent, useMemo, useState } from "react";

export type Quote = { id: string; name: string; company: string; priceCents: number; minDays: number | null; maxDays: number | null; mode: "live" | "demo"; pickup?: boolean };
export type CreatedOrder = { id: string; token: string; status: string; paymentStatus: string; quantity: number; unitPriceCents: number; subtotalCents: number; shippingPriceCents: number; totalCents: number; shippingServiceName: string; shippingCompany: string; checkoutUrl?: string | null; trackingCode?: string | null; trackingUrl?: string | null; mode: "live" | "demo"; createdAt: string };

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function CheckoutForm({ personalizationId, personalizationToken, onBack, onCreated }: { personalizationId: string; personalizationToken: string; onBack: () => void; onCreated: (order: CreatedOrder) => void }) {
  const [quantity, setQuantity] = useState(1);
  const [postalCode, setPostalCode] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [unitPriceCents, setUnitPriceCents] = useState(1990);
  const [quoteMode, setQuoteMode] = useState<"live" | "demo">("demo");
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState({ street: "", number: "", complement: "", district: "", city: "", state: "MT" });
  const selected = quotes.find(quote => quote.id === selectedId);
  const total = useMemo(() => unitPriceCents * quantity + (selected?.priceCents ?? 0), [unitPriceCents, quantity, selected]);

  const calculate = async () => {
    setLoadingQuotes(true); setError(""); setQuotes([]); setSelectedId("");
    try {
      const response = await fetch("/api/shipping/quotes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postalCode, quantity }) });
      const result = await response.json() as { quotes?: Quote[]; mode?: "live" | "demo"; unitPriceCents?: number; error?: string };
      if (!response.ok || !result.quotes) throw new Error(result.error || "Não foi possível calcular o frete.");
      setQuotes(result.quotes); setQuoteMode(result.mode || "demo"); setUnitPriceCents(result.unitPriceCents || 1990); setSelectedId(result.quotes[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível calcular o frete."); }
    finally { setLoadingQuotes(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) { setError("Escolha uma opção de entrega."); return; }
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personalizationId, personalizationToken, quantity, shippingServiceId: selected.id, postalCode, address }) });
      const result = await response.json() as CreatedOrder & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível criar o pedido.");
      onCreated(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o pedido."); }
    finally { setSubmitting(false); }
  };

  return <div className="checkout-step"><div className="sheet-title"><span>✓</span><div><small>PRÉVIA APROVADA</small><h2 id="customize-title">Entrega e pagamento</h2></div></div><form onSubmit={submit}>
    <section className="checkout-product"><div><strong>Caneca branca personalizada 11 oz</strong><span>Sublimação em alta resolução</span></div><label>Quantidade<select value={quantity} onChange={event => { setQuantity(Number(event.target.value)); setQuotes([]); setSelectedId(""); }}>{[1,2,3,4,5,6,7,8,9,10].map(value => <option key={value} value={value}>{value}</option>)}</select></label></section>
    <section className="shipping-calc"><label>CEP para entrega<div><input value={postalCode} onChange={event => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="78000-000" inputMode="numeric" required /><button type="button" onClick={calculate} disabled={loadingQuotes || postalCode.length !== 8}>{loadingQuotes ? "Calculando…" : "Calcular frete"}</button></div></label></section>
    {quotes.length > 0 && <section className="quote-list"><div className="quote-heading"><strong>Como deseja receber?</strong>{quoteMode === "demo" && <span>Valores demonstrativos</span>}</div>{quotes.map(quote => <label key={quote.id} className={selectedId === quote.id ? "selected" : ""}><input type="radio" name="shipping" value={quote.id} checked={selectedId === quote.id} onChange={() => setSelectedId(quote.id)} /><div><strong>{quote.name}</strong><span>{quote.company}{quote.minDays ? ` · ${quote.minDays}${quote.maxDays && quote.maxDays !== quote.minDays ? `–${quote.maxDays}` : ""} dias úteis` : " · local combinado"}</span></div><b>{quote.priceCents ? money(quote.priceCents) : "Grátis"}</b></label>)}</section>}
    {selected && !selected.pickup && <section className="address-fields"><h3>Endereço de entrega</h3><div className="two-fields"><label>Rua<input value={address.street} onChange={event => setAddress({ ...address, street: event.target.value })} required /></label><label>Número<input value={address.number} onChange={event => setAddress({ ...address, number: event.target.value })} required /></label></div><div className="two-fields"><label>Bairro<input value={address.district} onChange={event => setAddress({ ...address, district: event.target.value })} required /></label><label>Complemento<input value={address.complement} onChange={event => setAddress({ ...address, complement: event.target.value })} /></label></div><div className="two-fields"><label>Cidade<input value={address.city} onChange={event => setAddress({ ...address, city: event.target.value })} required /></label><label>UF<input value={address.state} onChange={event => setAddress({ ...address, state: event.target.value.toUpperCase().slice(0, 2) })} maxLength={2} required /></label></div></section>}
    {selected && <section className="checkout-summary"><p><span>{quantity} × caneca</span><b>{money(unitPriceCents * quantity)}</b></p><p><span>{selected.name}</span><b>{selected.priceCents ? money(selected.priceCents) : "Grátis"}</b></p><p className="checkout-total"><span>Total</span><b>{money(total)}</b></p><small>Pagamento processado com segurança pelo Mercado Pago.</small></section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="ready-actions"><button className="secondary-button" type="button" onClick={onBack}>Voltar</button><button className="generate-button" type="submit" disabled={!selected || submitting}>{submitting ? "Preparando pagamento…" : "Ir para o pagamento"}</button></div>
  </form></div>;
}
