// Logica di dominio pura (nessun accesso al DOM): statistiche, sistemi e backtest.

export const MIN_NUMERO = 1;
export const MAX_NUMERO = 55;
export const NUMERI_PER_COMBINAZIONE = 5;
export const MIN_SISTEMA = 6;
export const MAX_SISTEMA = 9;
export const COSTO_COMBINAZIONE = 1; // euro per ogni cinquina
export const COSTO_EXTRA = 1; // euro in più per cinquina con l'opzione Extra

/** Campo dell'estrazione che contiene i numeri del gioco scelto. */
export function campoGioco(gioco) {
  if (gioco === "million") return "numeri";
  if (gioco === "extra") return "numeri_extra";
  throw new Error(`Gioco sconosciuto: ${gioco}`);
}

export function binomiale(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** Tutte le combinazioni di k elementi, in ordine lessicografico. */
export function combinazioni(valori, k = NUMERI_PER_COMBINAZIONE) {
  const ordinati = [...valori].sort((a, b) => a - b);
  const out = [];
  const corrente = [];
  (function visita(inizio) {
    if (corrente.length === k) {
      out.push([...corrente]);
      return;
    }
    for (let i = inizio; i <= ordinati.length - (k - corrente.length); i++) {
      corrente.push(ordinati[i]);
      visita(i + 1);
      corrente.pop();
    }
  })(0);
  return out;
}

/** Controlla una selezione di numeri: restituisce un messaggio d'errore o null. */
export function validaSelezione(numeri, { min = NUMERI_PER_COMBINAZIONE, max = MAX_SISTEMA } = {}) {
  if (new Set(numeri).size !== numeri.length) return "Ci sono numeri ripetuti.";
  if (numeri.some((n) => !Number.isInteger(n) || n < MIN_NUMERO || n > MAX_NUMERO)) {
    return `I numeri devono essere interi tra ${MIN_NUMERO} e ${MAX_NUMERO}.`;
  }
  if (numeri.length < min) return `Scegli almeno ${min} numeri.`;
  if (numeri.length > max) return `Puoi scegliere al massimo ${max} numeri.`;
  return null;
}

/** Costo di un sistema integrale: una cinquina per ogni combinazione. */
export function costoSistema(quantiNumeri, conExtra = false) {
  const cinquine = binomiale(quantiNumeri, NUMERI_PER_COMBINAZIONE);
  const perCinquina = COSTO_COMBINAZIONE + (conExtra ? COSTO_EXTRA : 0);
  return { cinquine, costo: cinquine * perCinquina };
}

/** Ordina le estrazioni dalla più vecchia alla più recente. */
export function ordina(estrazioni) {
  return [...estrazioni].sort((a, b) => a.anno - b.anno || a.concorso - b.concorso);
}

/**
 * Applica la finestra di analisi a estrazioni già ordinate.
 * finestra: { tipo: "tutte" } | { tipo: "ultime", n } | { tipo: "giorni", n, oggi? }
 */
export function applicaFinestra(estrazioni, finestra = { tipo: "tutte" }) {
  if (finestra.tipo === "ultime") return estrazioni.slice(-finestra.n);
  if (finestra.tipo === "giorni") {
    const oggi = finestra.oggi ? new Date(finestra.oggi) : new Date();
    const limite = new Date(oggi);
    limite.setDate(limite.getDate() - finestra.n);
    const iso = limite.toISOString().slice(0, 10);
    return estrazioni.filter((e) => e.data > iso);
  }
  return estrazioni;
}

/**
 * Statistiche per ogni numero da 1 a 55.
 * La frequenza è calcolata sulla finestra; ritardo attuale e massimo su tutto l'archivio.
 */
export function statisticheNumeri(estrazioni, gioco, finestra) {
  const tutte = ordina(estrazioni);
  const campo = campoGioco(gioco);
  const nellaFinestra = applicaFinestra(tutte, finestra);

  const stat = new Map();
  for (let n = MIN_NUMERO; n <= MAX_NUMERO; n++) {
    stat.set(n, { numero: n, frequenza: 0, ritardo: 0, ritardoMax: 0, ultima: null, maiUscito: true });
  }
  for (const e of nellaFinestra) for (const n of e[campo]) stat.get(n).frequenza++;

  const ultimaPos = new Map();
  tutte.forEach((e, i) => {
    for (const n of e[campo]) {
      const s = stat.get(n);
      const prec = ultimaPos.has(n) ? ultimaPos.get(n) : -1;
      s.ritardoMax = Math.max(s.ritardoMax, i - prec - 1);
      ultimaPos.set(n, i);
      s.ultima = e;
      s.maiUscito = false;
    }
  });
  for (const s of stat.values()) {
    const prec = ultimaPos.has(s.numero) ? ultimaPos.get(s.numero) : -1;
    s.ritardo = tutte.length - prec - 1;
    s.ritardoMax = Math.max(s.ritardoMax, s.ritardo);
  }

  return {
    estrazioniAnalizzate: nellaFinestra.length,
    attesa: (nellaFinestra.length * NUMERI_PER_COMBINAZIONE) / (MAX_NUMERO - MIN_NUMERO + 1),
    numeri: [...stat.values()],
  };
}

/** Dettaglio di un singolo numero per la sezione "Chiedi un numero". */
export function dettaglioNumero(estrazioni, numero, gioco, finestra, quanteUscite = 10) {
  const tutte = ordina(estrazioni);
  const campo = campoGioco(gioco);
  const stat = statisticheNumeri(tutte, gioco, finestra).numeri[numero - 1];
  const uscite = tutte.filter((e) => e[campo].includes(numero));
  return { ...stat, totaleUscite: uscite.length, ultimeUscite: uscite.slice(-quanteUscite).reverse() };
}

/**
 * Backtest di un sistema integrale sulle estrazioni indicate.
 * Per ogni estrazione conta i numeri centrati h dalla selezione, poi le cinquine
 * che fanno k punti: C(h, k) * C(n - h, 5 - k).
 */
export function backtest(numeri, estrazioni, gioco) {
  const campo = campoGioco(gioco);
  const scelti = new Set(numeri);
  const n = scelti.size;
  const { cinquine } = costoSistema(n);
  const categorie = { 2: 0, 3: 0, 4: 0, 5: 0 };
  const distribuzioneCentrati = Array(NUMERI_PER_COMBINAZIONE + 1).fill(0);
  const migliori = [];
  let estrazioniVincenti = 0;

  for (const e of estrazioni) {
    const centrati = e[campo].filter((x) => scelti.has(x));
    const h = centrati.length;
    distribuzioneCentrati[h]++;
    let vincente = false;
    for (let k = 2; k <= NUMERI_PER_COMBINAZIONE; k++) {
      const quante = binomiale(h, k) * binomiale(n - h, NUMERI_PER_COMBINAZIONE - k);
      categorie[k] += quante;
      if (quante > 0) vincente = true;
    }
    if (vincente) estrazioniVincenti++;
    if (h >= 3) migliori.push({ estrazione: e, centrati });
  }

  migliori.sort((a, b) => b.centrati.length - a.centrati.length || b.estrazione.data.localeCompare(a.estrazione.data));
  return {
    estrazioni: estrazioni.length,
    cinquinePerEstrazione: cinquine,
    cinquineGiocate: cinquine * estrazioni.length,
    estrazioniVincenti,
    categorie,
    distribuzioneCentrati,
    migliori: migliori.slice(0, 20),
  };
}
