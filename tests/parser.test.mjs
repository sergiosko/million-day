import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dataPerConcorso, oraPerConcorso, parseArchivio, soloValide } from "../src/parser.ts";

const archivio = parseArchivio(readFileSync(new URL("./fixtures/archivio-2026.mht", import.meta.url), "utf8"));
const perConcorso = new Map(archivio.estrazioni.map((e) => [e.concorso, e]));

test("calendario: due concorsi al giorno", () => {
  assert.equal(dataPerConcorso(2026, 1), "2026-01-01");
  assert.equal(dataPerConcorso(2026, 2), "2026-01-01");
  assert.equal(dataPerConcorso(2026, 3), "2026-01-02");
  assert.equal(dataPerConcorso(2026, 632), "2026-11-12");
  assert.equal(dataPerConcorso(2026, 636), "2026-11-14");
  assert.equal(oraPerConcorso(635), "13:00");
  assert.equal(oraPerConcorso(636), "20:30");
});

test("archivio 2026: anno, nessun avviso, 636 concorsi consecutivi", () => {
  assert.equal(archivio.anno, 2026);
  assert.deepEqual(archivio.avvisi, []);
  assert.deepEqual(archivio.estrazioni.map((e) => e.concorso), Array.from({ length: 636 }, (_, i) => i + 1));
  assert.equal(soloValide(archivio.estrazioni).length, 636);
});

test("archivio 2026: righe note", () => {
  assert.deepEqual(perConcorso.get(636), {
    anno: 2026,
    concorso: 636,
    data: "2026-11-14",
    ora: "20:30",
    numeri: [1, 21, 27, 28, 29],
    numeri_extra: [10, 22, 24, 45, 53],
  });
  assert.deepEqual(perConcorso.get(632).numeri, [4, 19, 20, 36, 52]);
  assert.deepEqual(perConcorso.get(632).numeri_extra, [5, 9, 18, 27, 33]);
  assert.equal(perConcorso.get(1).data, "2026-01-01");
});

const riga = (data, concorso, numeri = "1 2 3 4 5", extra = "6 7 8 9 10") =>
  `<tr><td>${data}</td><td>${concorso}</td><td>${numeri.split(" ").map((n) => `<span>${n}</span>`).join(" ")}</td><td>${extra.split(" ").map((n) => `<span>${n}</span>`).join(" ")}</td></tr>`;
const pagina = (anno, righe) => `<table class="tba"><caption>Archivio estrazioni Million Day - ${anno}</caption><tbody>${righe.join("")}</tbody></table>`;

test("righe anomale: segnalate e scartate dal salvataggio", () => {
  const r = parseArchivio(pagina(2026, [riga("1/1/2026", 1), riga("1/1/2026", 2, "1 2 3 4", "6 7 8 9 99")]));
  assert.equal(r.estrazioni.length, 2);
  assert.equal(r.avvisi.length, 2); // numeri incompleti, extra fuori intervallo
  assert.deepEqual(soloValide(r.estrazioni).map((e) => e.concorso), [1]);
});

test("anno con una sola estrazione al giorno e poi due: date dalla pagina, orari dal giorno", () => {
  const r = parseArchivio(
    pagina(2023, [riga("3/1/2023", 4), riga("3/1/2023", 3), riga("2/1/2023", 2), riga("1/1/2023", 1)]),
  );
  assert.deepEqual(r.avvisi, []);
  assert.deepEqual(
    r.estrazioni.map((e) => [e.concorso, e.data, e.ora]),
    [[1, "2023-01-01", "20:30"], [2, "2023-01-02", "20:30"], [3, "2023-01-03", "13:00"], [4, "2023-01-03", "20:30"]],
  );
});

test("ultima estrazione del giorno in corso: è quella delle 13:00", () => {
  const r = parseArchivio(pagina(2026, [riga("Oggi", 3), riga("1/1/2026", 2), riga("1/1/2026", 1)]));
  assert.deepEqual(r.estrazioni.map((e) => [e.data, e.ora]), [["2026-01-01", "13:00"], ["2026-01-01", "20:30"], ["2026-01-02", "13:00"]]);
});

test("concorsi mancanti e date fuori anno: segnalati", () => {
  const r = parseArchivio(pagina(2025, [riga("2/1/2025", 4), riga("31/12/2024", 1)]));
  assert.equal(r.avvisi.some((a) => a.includes("concorsi mancanti: 2, 3")), true);
  assert.equal(r.avvisi.some((a) => a.includes("fuori dall'anno")), true);
});

test("pagina senza tabella", () => {
  assert.throws(() => parseArchivio("<html><body>Manutenzione</body></html>"), /Tabella/);
});
