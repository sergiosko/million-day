// Giocate salvate sul dispositivo (localStorage). Restano solo in questo browser:
// sul tablet e sul computer gli elenchi sono separati.

const CHIAVE = "million-day:giocate";
const MAX_GIOCATE = 100;

function memoria() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // alcuni browser bloccano l'accesso in modalità privata
  }
}

/** Legge le giocate salvate, dalla più recente; un contenuto illeggibile vale come elenco vuoto. */
export function leggiGiocate(storage = memoria()) {
  try {
    const dati = JSON.parse(storage?.getItem(CHIAVE) ?? "[]");
    return Array.isArray(dati) ? dati.filter(valida) : [];
  } catch {
    return [];
  }
}

function scrivi(giocate, storage) {
  if (!storage) throw new Error("Il salvataggio non è disponibile in questo browser.");
  storage.setItem(CHIAVE, JSON.stringify(giocate));
}

function valida(g) {
  return (
    g &&
    typeof g.id === "string" &&
    Array.isArray(g.numeri) &&
    g.numeri.length >= 5 &&
    g.numeri.length <= 9 &&
    g.numeri.every((n) => Number.isInteger(n) && n >= 1 && n <= 55)
  );
}

const stessaGiocata = (a, b) => a.conExtra === b.conExtra && a.numeri.join() === b.numeri.join();

/**
 * Salva una giocata in cima all'elenco. Se la stessa combinazione (numeri e opzione Extra)
 * è già salvata, la sposta in cima aggiornando il nome invece di duplicarla.
 */
export function salvaGiocata({ numeri, conExtra = false, nome = "" }, storage = memoria(), adesso = new Date()) {
  const nuova = {
    id: `${adesso.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nome: String(nome).trim().slice(0, 40),
    numeri: [...numeri].sort((a, b) => a - b),
    conExtra: Boolean(conExtra),
    creata: adesso.toISOString(),
  };
  if (!valida(nuova)) throw new Error("Servono da 5 a 9 numeri tra 1 e 55.");
  const esistenti = leggiGiocate(storage);
  const doppione = esistenti.find((g) => stessaGiocata(g, nuova));
  const elenco = [doppione ? { ...doppione, nome: nuova.nome || doppione.nome } : nuova, ...esistenti.filter((g) => g !== doppione)];
  scrivi(elenco.slice(0, MAX_GIOCATE), storage);
  return elenco[0];
}

export function eliminaGiocata(id, storage = memoria()) {
  scrivi(leggiGiocate(storage).filter((g) => g.id !== id), storage);
}
