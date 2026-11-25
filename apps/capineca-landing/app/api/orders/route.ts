export async function POST() {
  return Response.json(
    { error: "online_checkout_disabled", message: "Os pedidos da CapiNeca são finalizados por orçamento no WhatsApp." },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
