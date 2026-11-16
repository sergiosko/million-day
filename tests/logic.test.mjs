import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseArchivio } from "../src/parser.ts";
import {
  applicaFinestra,
  backtest,
  binomiale,
  combinazioni,
  costoSistema,
  dettaglioNumero,
  ordina,
  statisticheNumeri,
  validaSelezione,
} from "../public/js/logic.js";

const e = (concorso, numeri, extra = [50, 51, 52, 53, 54], data = "2026-01-01") => ({
  anno: 2026,
  concorso,
  data,
  numeri,
  numeri_extra: extra,
});

test("binomiale", () => {
  assert.equal(binomiale(6, 5), 6);
  assert.equal(binomiale(7, 5), 21);
  assert.equal(binomiale(8, 5), 56);
  assert.equal(binomiale(9, 5), 126);
  assert.equal(binomiale(4, 5), 0);
});

test("combinazioni del sistema integrale", () => {
  const c = combinazioni([7, 1, 3, 5, 9, 2]);
  assert.equal(c.length, 6);
  assert.deepEqual(c[0], [1, 2, 3, 5, 7]);
  assert.ok(c.every((x) => x.length === 5 && new Set(x).size === 5));
  assert.equal(combinazioni([1, 2, 3, 4, 5, 6, 7, 8, 9]).length, 126);
});

test("costo del sistema", () => {
  assert.deepEqual(costoSistema(5), { cinquine: 1, costo: 1 });
  assert.deepEqual(costoSistema(9), { cinquine: 126, costo: 126 });
  assert.deepEqual(costoSistema(9, true), { cinquine: 126, costo: 252 });
});

test("validazione della selezione", () => {
  assert.equal(validaSelezione([1, 2, 3, 4, 5]), null);
  assert.match(validaSelezione([1, 2, 3, 4]), /almeno 5/);
  assert.match(validaSelezione([1, 1, 2, 3, 4]), /ripetuti/);
  assert.match(validaSelezione([1, 2, 3, 4, 56]), /tra 1 e 55/);
  assert.match(validaSelezione([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), /al massimo 9/);
});

test("finestre", () => {
  const lista = [e(1, [1, 2, 3, 4, 5], undefined, "2026-01-01"), e(2, [1, 2, 3, 4, 5], undefined, "2026-01-10")];
  assert.equal(applicaFinestra(lista, { tipo: "ultime", n: 1 }).length, 1);
  assert.equal(applicaFinestra(lista, { tipo: "giorni", n: 5, oggi: "2026-01-12" }).length, 1);
  assert.equal(applicaFinestra(lista, { tipo: "tutte" }).length, 2);
});

test("ritardo, ritardo massimo e frequenza", () => {
  const lista = [
    e(1, [1, 2, 3, 4, 5]),
    e(2, [6, 7, 8, 9, 10]),
    e(3, [6, 7, 8, 9, 11]),
    e(4, [1, 12, 13, 14, 15]),
  ];
  const s = statisticheNumeri(lista, "million", { tipo: "tutte" }).numeri;
  assert.equal(s[0].frequenza, 2); // numero 1
  assert.equal(s[0].ritardo, 0);
  assert.equal(s[0].ritardoMax, 2); // assente nei concorsi 2 e 3
  assert.equal(s[1].ritardo, 3); // numero 2, uscito solo nel concorso 1
  assert.equal(s[54].ritardo, 4); // numero 55, mai uscito
  assert.equal(s[54].maiUscito, true);
  const ultime2 = statisticheNumeri(lista, "million", { tipo: "ultime", n: 2 }).numeri;
  assert.equal(ultime2[0].frequenza, 1);
  assert.equal(ultime2[0].ritardoMax, 2); // il ritardo massimo resta sullo storico completo
});

test("gioco Extra usa i numeri extra", () => {
  const lista = [e(1, [1, 2, 3, 4, 5], [10, 20, 30, 40, 50])];
  const s = statisticheNumeri(lista, "extra", { tipo: "tutte" }).numeri;
  assert.equal(s[9].frequenza, 1);
  assert.equal(s[0].frequenza, 0);
});

test("backtest conta le cinquine vincenti per categoria", () => {
  // Selezione di 6 numeri, estrazione con 3 centrati: le cinquine con 3 punti sono
  // C(3,3)*C(3,2)=3, con 2 punti C(3,2)*C(3,3)=3.
  const r = backtest([1, 2, 3, 4, 5, 6], [e(1, [1, 2, 3, 40, 41])], "million");
  assert.equal(r.cinquinePerEstrazione, 6);
  assert.equal(r.categorie[3], 3);
  assert.equal(r.categorie[2], 3);
  assert.equal(r.categorie[4], 0);
  assert.equal(r.estrazioniVincenti, 1);
  assert.equal(r.distribuzioneCentrati[3], 1);
  assert.equal(r.migliori.length, 1);
});

test("backtest di una cinquina centrata", () => {
  const r = backtest([1, 2, 3, 4, 5], [e(1, [1, 2, 3, 4, 5]), e(2, [9, 10, 11, 12, 13])], "million");
  assert.equal(r.categorie[5], 1);
  assert.equal(r.categorie[2], 0); // una cinquina singola vince solo nella categoria più alta
  assert.equal(r.estrazioniVincenti, 1);
  assert.equal(r.cinquineGiocate, 2);
});

test("archivio reale 2026", () => {
  const raw = readFileSync(new URL("./fixtures/archivio-2026.mht", import.meta.url), "utf8");
  const tutte = ordina(parseArchivio(raw).estrazioni);
  assert.equal(tutte.length, 636);
  const s = statisticheNumeri(tutte, "million", { tipo: "tutte" });
  const somma = s.numeri.reduce((acc, x) => acc + x.frequenza, 0);
  assert.equal(somma, tutte.length * 5);
  const d = dettaglioNumero(tutte, 21, "million", { tipo: "tutte" });
  assert.equal(d.totaleUscite, d.frequenza);
});
