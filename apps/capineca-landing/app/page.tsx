import CapinecaLanding from "./CapinecaLanding";
import { getSiteContent } from "../lib/site-content";

export const dynamic = "force-dynamic";

export default async function Home() {
  const content = await getSiteContent();
  return <CapinecaLanding
    content={content}
    supabaseUrl={process.env.SUPABASE_URL || ""}
    supabaseAnonKey={process.env.SUPABASE_ANON_KEY || ""}
    whatsappNumber={content.whatsappNumber || process.env.CAPINECA_WHATSAPP_NUMBER || ""}
  />;
}
