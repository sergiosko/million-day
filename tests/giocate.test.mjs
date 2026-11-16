import assert from "node:assert/strict";
import { test } from "node:test";
import { eliminaGiocata, leggiGiocate, salvaGiocata } from "../public/js/giocate.js";

function memoriaFinta(iniziale = {}) {
  const dati = { ...iniziale };
  return {
    getItem: (k) => (k in dati ? dati[k] : null),
    setItem: (k, v) => (dati[k] = String(v)),
  };
}

test("salva, ordina i numeri e legge dalla più recente", () => {
  const m = memoriaFinta();
  salvaGiocata({ numeri: [9, 3, 7, 1, 5] }, m, new Date("2026-11-16T10:00:00Z"));
  salvaGiocata({ numeri: [10, 20, 30, 40, 50, 55], conExtra: true, nome: "  Sistema  " }, m, new Date("2026-11-16T11:00:00Z"));
  const g = leggiGiocate(m);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].numeri, [10, 20, 30, 40, 50, 55]);
  assert.equal(g[0].nome, "Sistema");
  assert.equal(g[0].conExtra, true);
  assert.deepEqual(g[1].numeri, [1, 3, 5, 7, 9]);
});

test("la stessa giocata non si duplica: torna in cima e prende il nuovo nome", () => {
  const m = memoriaFinta();
  salvaGiocata({ numeri: [1, 2, 3, 4, 5], nome: "prima" }, m);
  salvaGiocata({ numeri: [6, 7, 8, 9, 10] }, m);
  salvaGiocata({ numeri: [5, 4, 3, 2, 1], nome: "rinominata" }, m);
  const g = leggiGiocate(m);
  assert.equal(g.length, 2);
  assert.equal(g[0].nome, "rinominata");
  // con l'Extra è una giocata diversa
  salvaGiocata({ numeri: [1, 2, 3, 4, 5], conExtra: true }, m);
  assert.equal(leggiGiocate(m).length, 3);
});

test("elimina", () => {
  const m = memoriaFinta();
  const a = salvaGiocata({ numeri: [1, 2, 3, 4, 5] }, m);
  salvaGiocata({ numeri: [6, 7, 8, 9, 10] }, m);
  eliminaGiocata(a.id, m);
  assert.deepEqual(leggiGiocate(m).map((g) => g.numeri[0]), [6]);
});

test("rifiuta giocate non valide e ignora dati corrotti", () => {
  const m = memoriaFinta();
  assert.throws(() => salvaGiocata({ numeri: [1, 2, 3, 4] }, m), /da 5 a 9/);
  assert.throws(() => salvaGiocata({ numeri: [1, 2, 3, 4, 56] }, m), /tra 1 e 55/);
  assert.deepEqual(leggiGiocate(memoriaFinta({ "million-day:giocate": "non è json" })), []);
  assert.deepEqual(leggiGiocate(null), []);
});
