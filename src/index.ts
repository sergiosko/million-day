/**
 * Million Day — Worker Cloudflare + D1.
 * Serve l'app statica (public/), espone l'archivio su /api/* e, con il Cron Trigger,
 * scarica le nuove estrazioni da archiviomillionday.it dopo ogni concorso.
 */

import { parseArchivio, soloValide, type Estrazione } from "./parser.ts";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Facoltativa: indirizzo alternativo della pagina di archivio (per le prove in locale). */
  URL_ARCHIVIO?: string;
}

const URL_ARCHIVIO = "https://www.archiviomillionday.it/archivio-million-day.amp.php";
const USER_AGENT = "million-day-archivio/1.0 (uso personale; github.com/sergiosko/million-day)";

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

/* ---------- archivio su D1 ---------- */

type Riga = { anno: number; concorso: number; data: string; ora: string; numeri: string; numeri_extra: string };

async function leggiMeta(env: Env): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare("SELECT chiave, valore FROM meta").all<{ chiave: string; valore: string }>();
  return Object.fromEntries(results.map((r) => [r.chiave, r.valore]));
}

async function scriviMeta(env: Env, valori: Record<string, string>): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO meta (chiave, valore)
     SELECT key, value FROM json_each(?1) WHERE true
     ON CONFLICT (chiave) DO UPDATE SET valore = excluded.valore`,
  )
    .bind(JSON.stringify(valori))
    .run();
}

async function leggiEstrazioni(env: Env): Promise<Estrazione[]> {
  const { results } = await env.DB.prepare(
    "SELECT anno, concorso, data, ora, numeri, numeri_extra FROM estrazioni ORDER BY anno, concorso",
  ).all<Riga>();
  return results.map((r) => ({ ...r, numeri: JSON.parse(r.numeri), numeri_extra: JSON.parse(r.numeri_extra) }));
}

/** Inserisce le estrazioni mancanti con una sola query; restituisce quante ne ha aggiunte. */
async function salvaEstrazioni(env: Env, estrazioni: Estrazione[]): Promise<number> {
  if (!estrazioni.length) return 0;
  const righe = estrazioni.map((e) => ({ ...e, numeri: JSON.stringify(e.numeri), numeri_extra: JSON.stringify(e.numeri_extra) }));
  const esito = await env.DB.prepare(
    `INSERT OR IGNORE INTO estrazioni (anno, concorso, data, ora, numeri, numeri_extra)
     SELECT value ->> 'anno', value ->> 'concorso', value ->> 'data', value ->> 'ora',
            value ->> 'numeri', value ->> 'numeri_extra'
     FROM json_each(?1)`,
  )
    .bind(JSON.stringify(righe))
    .run();
  return esito.meta.changes ?? 0;
}

/* ---------- aggiornamento dalla fonte ---------- */

async function aggiorna(env: Env): Promise<{ lette: number; nuove: number; avvisi: string[] }> {
  const adesso = new Date().toISOString();
  try {
    const risposta = await fetch(env.URL_ARCHIVIO || URL_ARCHIVIO, { headers: { "user-agent": USER_AGENT } });
    if (!risposta.ok) throw new Error(`La fonte ha risposto HTTP ${risposta.status}`);
    const archivio = parseArchivio(await risposta.text());
    if (!archivio.estrazioni.length) throw new Error("Nessuna estrazione trovata nella pagina");
    const nuove = await salvaEstrazioni(env, soloValide(archivio.estrazioni));
    await scriviMeta(env, {
      ultimo_controllo: adesso,
      ultimo_errore: "",
      ultimi_avvisi: JSON.stringify(archivio.avvisi.slice(0, 20)),
      ...(nuove ? { aggiornato: adesso } : {}),
    });
    return { lette: archivio.estrazioni.length, nuove, avvisi: archivio.avvisi };
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : String(err);
    await scriviMeta(env, { ultimo_controllo: adesso, ultimo_errore: messaggio });
    throw err;
  }
}

/* ---------- API ---------- */

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") return json({ errore: "Metodo non consentito" }, 405);

  if (url.pathname === "/api/estrazioni") {
    const [estrazioni, meta] = await Promise.all([leggiEstrazioni(env), leggiMeta(env)]);
    return json({ fonte: "archiviomillionday.it", aggiornato: meta.aggiornato ?? null, estrazioni });
  }

  if (url.pathname === "/api/stato") {
    const [meta, conteggio] = await Promise.all([
      leggiMeta(env),
      env.DB.prepare("SELECT COUNT(*) AS totale, MAX(data) AS ultima FROM estrazioni").first<{ totale: number; ultima: string | null }>(),
    ]);
    return json({
      estrazioni: conteggio?.totale ?? 0,
      ultima_data: conteggio?.ultima ?? null,
      aggiornato: meta.aggiornato ?? null,
      ultimo_controllo: meta.ultimo_controllo ?? null,
      ultimo_errore: meta.ultimo_errore || null,
      ultimi_avvisi: JSON.parse(meta.ultimi_avvisi ?? "[]"),
    });
  }

  return json({ errore: "Non trovato" }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (err) {
      console.error(err);
      return json({ errore: "Errore interno" }, 500);
    }
  },

  async scheduled(_evento, env, ctx): Promise<void> {
    ctx.waitUntil(
      aggiorna(env).then(
        (r) => console.log(`Aggiornamento: ${r.lette} lette, ${r.nuove} nuove, ${r.avvisi.length} avvisi`),
        (err) => console.error("Aggiornamento fallito:", err),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
