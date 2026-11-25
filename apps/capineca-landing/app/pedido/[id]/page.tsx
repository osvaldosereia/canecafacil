import type { Metadata } from "next";
import OrderStatusClient from "./OrderStatusClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acompanhar pedido", robots: { index: false, follow: false, noarchive: true } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  return <OrderStatusClient id={id} token={token} />;
}
