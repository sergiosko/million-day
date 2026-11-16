/**
 * Parser delle pagine di archivio di archiviomillionday.it.
 * Modulo puro (nessuna API di Workers): lo usano il Worker, lo script di seed e i test.
 */

export type Estrazione = {
  anno: number;
  concorso: number;
  data: string; // aaaa-mm-gg
  ora: string; // 13:00 | 20:30
  numeri: number[];
  numeri_extra: number[];
};

export type Archivio = { anno: number; estrazioni: Estrazione[]; avvisi: string[] };

const RE_TABELLA = /<table[^>]*class="[^"]*\btba\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i;
const RE_ANNO = /Archivio estrazioni Million Day\s*-\s*(\d{4})/i;
const RE_RIGA = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const RE_CELLA = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const RE_SPAN = /<span[^>]*>\s*([^<]*?)\s*<\/span>/gi;
const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const RE_DATA_LINK = /del-(\d{1,2})-(\d{1,2})-(\d{4})-concorso-\d+/;

/** Restituisce l'HTML della pagina anche da uno snapshot .mht salvato dal browser. */
export function estraiHtml(raw: string): string {
  const inizio = raw.indexOf("<!DOCTYPE html");
  if (inizio === -1) return raw;
  const fine = raw.indexOf("\n------MultipartBoundary", inizio);
  return fine === -1 ? raw.slice(inizio) : raw.slice(inizio, fine);
}

const iso = (anno: number, mese: number, giorno: number) =>
  `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;

/** Due estrazioni al giorno: i concorsi 1-2 cadono il 1 gennaio, 3-4 il 2 gennaio, e così via. */
export function dataPerConcorso(anno: number, concorso: number): string {
  const d = new Date(Date.UTC(anno, 0, Math.floor((concorso + 1) / 2)));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Il concorso dispari è quello delle 13:00, il pari quello delle 20:30. */
export const oraPerConcorso = (concorso: number) => (concorso % 2 === 1 ? "13:00" : "20:30");

const testo = (html: string) => html.replace(/<[^>]*>/g, "").trim();

function numeriCella(cella: string, etichetta: string, avvisi: string[]): number[] {
  const valori = [...cella.matchAll(RE_SPAN)].map((m) => Number(m[1]));
  const validi =
    valori.length === 5 &&
    new Set(valori).size === 5 &&
    valori.every((n) => Number.isInteger(n) && n >= 1 && n <= 55);
  if (!validi) avvisi.push(`${etichetta} non validi: ${JSON.stringify(valori)}`);
  return valori;
}

/** Converte la pagina di archivio (HTML o .mht) nelle estrazioni dell'anno, in ordine di concorso. */
export function parseArchivio(raw: string): Archivio {
  const html = estraiHtml(raw);
  const tabella = RE_TABELLA.exec(html);
  if (!tabella) throw new Error("Tabella dell'archivio non trovata");
  const annoTrovato = RE_ANNO.exec(tabella[1]);
  if (!annoTrovato) throw new Error("Anno non trovato nella didascalia della tabella");
  const anno = Number(annoTrovato[1]);

  const avvisi: string[] = [];
  const estrazioni: Estrazione[] = [];
  for (const riga of tabella[1].matchAll(RE_RIGA)) {
    const celle = [...riga[1].matchAll(RE_CELLA)].map((m) => m[1]);
    if (celle.length === 0) continue; // riga di intestazione
    if (celle.length !== 4) {
      avvisi.push(`riga scartata: ${celle.length} celle invece di 4`);
      continue;
    }
    const concorso = Number(testo(celle[1]));
    if (!Number.isInteger(concorso) || concorso < 1) {
      avvisi.push(`concorso non valido: ${testo(celle[1])}`);
      continue;
    }

    // La data è in chiaro (gg/mm/aaaa) oppure "Oggi"/"Ieri": in quel caso la calcoliamo
    // dal concorso, che vale negli anni con due estrazioni al giorno dal 1 gennaio.
    const chiaro = RE_DATA.exec(testo(celle[0])) ?? RE_DATA_LINK.exec(celle[0]);
    const data = chiaro ? iso(Number(chiaro[3]), Number(chiaro[2]), Number(chiaro[1])) : dataPerConcorso(anno, concorso);
    if (!data.startsWith(`${anno}-`)) avvisi.push(`concorso ${concorso}: data ${data} fuori dall'anno ${anno}`);

    estrazioni.push({
      anno,
      concorso,
      data,
      ora: "20:30", // assegnata sotto, in base alle estrazioni dello stesso giorno
      numeri: numeriCella(celle[2], `concorso ${concorso}: numeri`, avvisi),
      numeri_extra: numeriCella(celle[3], `concorso ${concorso}: numeri extra`, avvisi),
    });
  }

  estrazioni.sort((a, b) => a.concorso - b.concorso);
  assegnaOre(estrazioni);
  segnalaBuchi(estrazioni, avvisi);
  return { anno, estrazioni, avvisi };
}

/**
 * Orario delle estrazioni. Con due estrazioni nello stesso giorno la prima è delle 13:00
 * e la seconda delle 20:30. Un'estrazione sola nel giorno è delle 20:30 (fino a marzo 2023
 * c'era solo quella serale), salvo due casi riconoscibili dai numeri di concorso:
 * - manca il concorso successivo (il giorno dopo riparte da concorso + 2): è quella
 *   delle 13:00 e la serale non è nell'archivio;
 * - è l'ultima dell'archivio e il giorno prima ne aveva due: è quella delle 13:00 di oggi.
 */
function assegnaOre(estrazioni: Estrazione[]): void {
  const perData = new Map<string, Estrazione[]>();
  for (const e of estrazioni) perData.set(e.data, [...(perData.get(e.data) ?? []), e]);
  const date = [...perData.keys()].sort();
  date.forEach((data, i) => {
    const gruppo = perData.get(data)!;
    if (gruppo.length >= 2) {
      gruppo.forEach((e, j) => (e.ora = j === 0 ? "13:00" : "20:30"));
      return;
    }
    const sola = gruppo[0];
    const prima = i > 0 ? perData.get(date[i - 1])! : null;
    const dopo = i < date.length - 1 ? perData.get(date[i + 1])! : null;
    const mancaLaPrecedente = prima !== null && prima[prima.length - 1].concorso === sola.concorso - 2;
    const mancaLaSuccessiva = dopo !== null && dopo[0].concorso === sola.concorso + 2;
    const inAttesaDellaSerale = dopo === null && prima !== null && prima.length >= 2;
    sola.ora = !mancaLaPrecedente && (mancaLaSuccessiva || inAttesaDellaSerale) ? "13:00" : "20:30";
  });
}

/** Segnala i concorsi mancanti nella sequenza e i giorni con più di due estrazioni. */
function segnalaBuchi(estrazioni: Estrazione[], avvisi: string[]): void {
  const presenti = new Set(estrazioni.map((e) => e.concorso));
  if (presenti.size !== estrazioni.length) avvisi.push("ci sono concorsi ripetuti");
  const max = Math.max(0, ...presenti);
  const mancanti = [];
  for (let c = 1; c <= max; c++) if (!presenti.has(c)) mancanti.push(c);
  if (mancanti.length) avvisi.push(`concorsi mancanti: ${mancanti.slice(0, 30).join(", ")}${mancanti.length > 30 ? ", …" : ""}`);
  const perData = new Map<string, number>();
  for (const e of estrazioni) perData.set(e.data, (perData.get(e.data) ?? 0) + 1);
  for (const [data, quante] of perData) if (quante > 2) avvisi.push(`${data}: ${quante} estrazioni nello stesso giorno`);
}

/** Solo le estrazioni con cinque numeri validi per gioco: le altre non vanno salvate. */
export function soloValide(estrazioni: Estrazione[]): Estrazione[] {
  const ok = (v: number[]) => v.length === 5 && new Set(v).size === 5 && v.every((n) => Number.isInteger(n) && n >= 1 && n <= 55);
  return estrazioni.filter((e) => ok(e.numeri) && ok(e.numeri_extra));
}
