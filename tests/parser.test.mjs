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

test("righe anomale: segnalate e scartate dal salvataggio", () => {
  const html = `<table class="tba"><caption>Archivio estrazioni Million Day - 2026</caption><tbody>
    <tr><td>1/1/2026</td><td>1</td><td><span>1</span> <span>2</span> <span>3</span> <span>4</span> <span>5</span></td><td><span>6</span> <span>7</span> <span>8</span> <span>9</span> <span>10</span></td></tr>
    <tr><td>5/1/2026</td><td>2</td><td><span>1</span> <span>2</span> <span>3</span> <span>4</span></td><td><span>6</span> <span>7</span> <span>8</span> <span>9</span> <span>99</span></td></tr>
  </tbody></table>`;
  const r = parseArchivio(html);
  assert.equal(r.estrazioni.length, 2);
  assert.equal(r.avvisi.length, 3); // data incoerente, numeri incompleti, extra fuori intervallo
  assert.deepEqual(soloValide(r.estrazioni).map((e) => e.concorso), [1]);
});

test("pagina senza tabella", () => {
  assert.throws(() => parseArchivio("<html><body>Manutenzione</body></html>"), /Tabella/);
});
