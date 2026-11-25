import Link from "next/link";

export default function NotFound() {
  return <main className="not-found-page" id="conteudo-principal"><span className="brand-mark">C</span><small>PÁGINA NÃO ENCONTRADA</small><h1>Esta arte não está disponível</h1><p>O modelo pode ter sido removido ou ainda não foi publicado.</p><Link href="/">Explorar modelos de canecas</Link></main>;
}
