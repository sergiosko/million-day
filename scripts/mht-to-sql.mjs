// Genera seed.sql dalle pagine di archivio: indirizzi web oppure snapshot salvati dal
// browser (.mht o .html).
// Uso: npm run seed -- https://www.archiviomillionday.it/million-day-archivio-2025.php
//      npm run seed -- archivio-2025.mht archivio-2024.mht
// Senza argomenti usa gli snapshot in tests/fixtures/.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArchivio, soloValide } from "../src/parser.ts";

const FIXTURES = new URL("../tests/fixtures/", import.meta.url).pathname;
const file = process.argv.slice(2);
if (!file.length) file.push(...readdirSync(FIXTURES).filter((f) => /\.(mht|html?)$/.test(f)).map((f) => join(FIXTURES, f)));
if (!file.length) {
  console.error("Nessuno snapshot da importare.");
  process.exit(1);
}

const sql = (v) => (typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);
const righe = [];
let errori = 0;
for (const nome of file) {
  let raw;
  if (/^https?:\/\//.test(nome)) {
    const risposta = await fetch(nome, { headers: { "user-agent": "million-day-archivio/1.0 (uso personale)" } });
    if (!risposta.ok) {
      console.error(`errore [${nome}]: HTTP ${risposta.status}`);
      errori++;
      continue;
    }
    raw = await risposta.text();
  } else {
    raw = readFileSync(nome, "utf8");
  }
  const archivio = parseArchivio(raw);
  const valide = soloValide(archivio.estrazioni);
  for (const avviso of archivio.avvisi) console.error(`avviso [${nome}]: ${avviso}`);
  if (!valide.length) {
    console.error(`errore [${nome}]: nessuna estrazione valida`);
    errori++;
    continue;
  }
  console.log(`${nome}: anno ${archivio.anno}, ${valide.length} estrazioni`);
  for (const e of valide) {
    righe.push(`(${[e.anno, e.concorso, e.data, e.ora, JSON.stringify(e.numeri), JSON.stringify(e.numeri_extra)].map(sql).join(", ")})`);
  }
}

const blocchi = [];
for (let i = 0; i < righe.length; i += 200) {
  blocchi.push(`INSERT OR IGNORE INTO estrazioni (anno, concorso, data, ora, numeri, numeri_extra) VALUES\n${righe.slice(i, i + 200).join(",\n")};`);
}
blocchi.push(
  `INSERT INTO meta (chiave, valore) VALUES ('aggiornato', ${sql(new Date().toISOString())})\n  ON CONFLICT (chiave) DO UPDATE SET valore = excluded.valore;`,
);
writeFileSync("seed.sql", blocchi.join("\n\n") + "\n");
console.log(`seed.sql: ${righe.length} estrazioni`);
process.exit(errori ? 1 : 0);
