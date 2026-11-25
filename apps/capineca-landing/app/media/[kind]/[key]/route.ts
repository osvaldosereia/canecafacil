import { getArchivedImage } from "../../../../lib/assets";

export async function GET(_request: Request, context: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await context.params;
  const object = await getArchivedImage(kind, key);
  if (!object) return new Response("Imagem não encontrada.", { status: 404, headers: { "cache-control": "public, max-age=60" } });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
