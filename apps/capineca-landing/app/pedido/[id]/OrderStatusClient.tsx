"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CreatedOrder } from "../../CheckoutForm";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function OrderStatusClient({ id, token }: { id: string; token: string }) {
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/orders/${id}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const result = await response.json() as CreatedOrder & { error?: string };
        if (!response.ok) throw new Error(result.error || "Pedido não encontrado.");
        if (active) setOrder(result);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Pedido não encontrado."); }
    };
    load();
    const timer = window.setInterval(load, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [id, token]);

  const progress: Record<string, { label: string; title: string; text: string; done?: boolean }> = {
    awaiting_payment: { label: "AGUARDANDO PAGAMENTO", title: "Aguardando confirmação", text: "O Mercado Pago pode levar alguns instantes para confirmar Pix, boleto ou cartão." },
    paid: { label: "PAGAMENTO APROVADO", title: "Pedido confirmado!", text: "Sua caneca entrará na fila de produção.", done: true },
    awaiting_production: { label: "FILA DE PRODUÇÃO", title: "Tudo pronto para produzir", text: "A arte foi aprovada e sua caneca está na fila da nossa equipe.", done: true },
    in_production: { label: "EM PRODUÇÃO", title: "Sua caneca está sendo feita", text: "A personalização já está em produção.", done: true },
    produced: { label: "PRODUÇÃO CONCLUÍDA", title: "Caneca pronta!", text: "Estamos preparando a entrega do seu pedido.", done: true },
    shipped: { label: "PEDIDO ENVIADO", title: "Sua caneca está a caminho", text: "Use o rastreio abaixo para acompanhar a entrega.", done: true },
    delivered: { label: "PEDIDO ENTREGUE", title: "Pedido concluído", text: "Esperamos que você aproveite sua caneca personalizada!", done: true },
    cancelled: { label: "PEDIDO CANCELADO", title: "Pedido cancelado", text: "Entre em contato conosco se precisar de ajuda." },
  };
  const state = order ? (progress[order.status] ?? progress.awaiting_payment) : progress.awaiting_payment;
  return <main className="order-status-page"><section><Link className="brand" href="/"><span className="brand-mark">C</span><span>canecas<small>feita do seu jeito</small></span></Link>{error ? <div className="status-content"><div className="error-mark">!</div><h1>Não encontramos este pedido</h1><p>{error}</p></div> : !order ? <div className="status-content"><div className="magic-loader">✦</div><h1>Consultando pedido</h1><p>Aguarde um instante.</p></div> : <div className="status-content"><div className={state.done ? "success-mark" : "pending-mark"}>{state.done ? "✓" : "⌛"}</div><small>{state.label}</small><h1>{state.title}</h1><p>{state.text}</p><div className="order-receipt"><p><span>Pedido</span><b>{String(order.id).slice(0, 8).toUpperCase()}</b></p><p><span>Quantidade</span><b>{order.quantity}</b></p><p><span>Entrega</span><b>{order.shippingServiceName}</b></p><p className="checkout-total"><span>Total</span><b>{money(order.totalCents)}</b></p></div>{order.status === "awaiting_payment" && order.checkoutUrl && <a className="status-primary" href={order.checkoutUrl}>Voltar ao pagamento</a>}{order.status === "shipped" && order.trackingUrl && <a className="status-primary" href={order.trackingUrl} target="_blank" rel="noreferrer">Acompanhar entrega{order.trackingCode ? ` · ${order.trackingCode}` : ""}</a>}</div>}<Link className="status-back" href="/">Voltar para os modelos</Link></section></main>;
}
