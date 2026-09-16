export const FOUNDATION_RESPONSE =
  'Entendi. Pode continuar me contando como você imagina sua caneca.';

export async function* createFoundationResponse(): AsyncIterable<string> {
  const midpoint = Math.ceil(FOUNDATION_RESPONSE.length / 2);
  yield FOUNDATION_RESPONSE.slice(0, midpoint);
  yield FOUNDATION_RESPONSE.slice(midpoint);
}
