export async function POST() {
  return Response.json(
    { error: "legacy_personalizer_disabled", message: "Use o personalizador empresarial da CapiNeca na página inicial." },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
