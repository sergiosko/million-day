import {
  MAX_NUMERO,
  MAX_SISTEMA,
  PREMI,
  applicaFinestra,
  backtest,
  combinazioni,
  costoSistema,
  dettaglioNumero,
  ordina,
  statisticheNumeri,
  validaSelezione,
} from "./logic.js";
import { eliminaGiocata, leggiGiocate, salvaGiocata } from "./giocate.js";

const URL_DATI = "api/estrazioni";
const PAGINA_LISTA = 30;
const FINESTRE = [
  { id: "ultime-50", nome: "Ultime 50 estrazioni", finestra: { tipo: "ultime", n: 50 } },
  { id: "ultime-100", nome: "Ultime 100 estrazioni", finestra: { tipo: "ultime", n: 100 } },
  { id: "giorni-90", nome: "Ultimi 3 mesi", finestra: { tipo: "giorni", n: 90 } },
  { id: "giorni-180", nome: "Ultimi 6 mesi", finestra: { tipo: "giorni", n: 180 } },
  { id: "tutte", nome: "Tutto l'archivio", finestra: { tipo: "tutte" } },
];
const NOMI_GIOCO = { million: "Million Day", extra: "Extra" };

const $ = (sel) => document.querySelector(sel);
const stato = { estrazioni: [], mostrate: PAGINA_LISTA, selezione: new Set() };

// ---------- utilità di rendering ----------

function el(tag, attrs = {}, ...figli) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") nodo.className = v;
    else if (k === "text") nodo.textContent = v;
    else nodo.setAttribute(k, v);
  }
  for (const f of figli.flat()) if (f != null) nodo.append(f);
  return nodo;
}

function palline(numeri, { extra = false, centrati = [], grande = false, piccola = false } = {}) {
  const set = new Set(centrati);
  return el(
    "div",
    { class: "palline" },
    numeri.map((n) =>
      el("span", {
        class: ["pallina", extra && "extra", set.has(n) && "centrato", grande && "grande", piccola && "piccola"].filter(Boolean).join(" "),
        text: String(n),
      }),
    ),
  );
}

const formatoData = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
function dataLeggibile(iso) {
  return formatoData.format(new Date(`${iso}T12:00:00`));
}
function etichettaEstrazione(e) {
  return `${dataLeggibile(e.data)} · ore ${e.ora} · concorso ${e.concorso}/${e.anno}`;
}
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const intero = new Intl.NumberFormat("it-IT");

function finestraSelezionata(select) {
  return FINESTRE.find((f) => f.id === select.value).finestra;
}

// ---------- navigazione ----------

function mostraVista(nome) {
  document.querySelectorAll(".vista").forEach((v) => (v.hidden = v.dataset.vista !== nome));
  document.querySelectorAll(".tabbar button").forEach((b) => {
    if (b.dataset.tab === nome) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (location.hash !== `#${nome}`) history.replaceState(null, "", `#${nome}`);
  window.scrollTo({ top: 0 });
}

// ---------- Estrazioni ----------

function renderUltima() {
  const e = stato.estrazioni.at(-1);
  if (!e) return;
  $("#ultima").replaceChildren(
    el("h2", { text: "Ultima estrazione" }),
    el("p", { class: "data", text: etichettaEstrazione(e) }),
    el("p", { class: "etichetta", text: "Million Day" }),
    palline(e.numeri, { grande: true }),
    el("p", { class: "etichetta", text: "Extra" }),
    palline(e.numeri_extra, { extra: true, grande: true }),
  );
}

function popolaAnni() {
  const anni = [...new Set(stato.estrazioni.map((e) => e.anno))].sort((a, b) => b - a);
  $("#filtro-anno").replaceChildren(
    el("option", { value: "", text: "Tutti gli anni" }),
    ...anni.map((a) => el("option", { value: String(a), text: String(a) })),
  );
}

function renderLista() {
  const data = $("#filtro-data").value;
  const anno = Number($("#filtro-anno").value) || null;
  let filtrate = [...stato.estrazioni].reverse();
  if (anno) filtrate = filtrate.filter((e) => e.anno === anno);
  if (data) filtrate = filtrate.filter((e) => e.data === data);
  const elenco = data ? filtrate : filtrate.slice(0, stato.mostrate);
  const lista = $("#lista-estrazioni");
  if (!elenco.length) {
    const vuoto = data && anno && !data.startsWith(`${anno}-`) ? `La data scelta non è nel ${anno}.` : "Nessuna estrazione trovata.";
    lista.replaceChildren(el("li", { class: "muted", text: vuoto }));
  } else {
    lista.replaceChildren(
      ...elenco.map((e) =>
        el(
          "li",
          {},
          el("span", { class: "intestazione", text: etichettaEstrazione(e) }),
          el("div", { class: "giochi" }, palline(e.numeri), palline(e.numeri_extra, { extra: true })),
        ),
      ),
    );
  }
  $("#conteggio-lista").textContent = data
    ? ""
    : `${intero.format(Math.min(stato.mostrate, filtrate.length))} di ${intero.format(filtrate.length)} estrazioni${anno ? ` del ${anno}` : ""}`;
  $("#altre-estrazioni").hidden = Boolean(data) || stato.mostrate >= filtrate.length;
}

// ---------- Chiedi un numero ----------

function renderNumero(evento) {
  evento?.preventDefault();
  const numero = Number($("#input-numero").value);
  const contenitore = $("#risultato-numero");
  if (!Number.isInteger(numero) || numero < 1 || numero > MAX_NUMERO) {
    contenitore.replaceChildren(el("p", { class: "card muted", text: "Inserisci un numero tra 1 e 55." }));
    return;
  }
  const gioco = $("#numero-gioco").value;
  const finestraSel = $("#numero-finestra");
  const finestra = finestraSelezionata(finestraSel);
  const nomeFinestra = finestraSel.selectedOptions[0].textContent.toLowerCase();
  const d = dettaglioNumero(stato.estrazioni, numero, gioco, finestra);
  const analizzate = applicaFinestra(stato.estrazioni, finestra).length;
  const attesa = (analizzate * 5) / MAX_NUMERO;

  const metrica = (valore, nome) => el("div", { class: "metrica" }, el("div", { class: "valore", text: valore }), el("div", { class: "nome", text: nome }));
  const ultimaTesto = d.ultima ? etichettaEstrazione(d.ultima) : "mai uscito nell'archivio";

  contenitore.replaceChildren(
    el(
      "div",
      { class: "card" },
      el("div", { class: "riga-controlli" }, palline([numero], { extra: gioco === "extra", grande: true }), el("h2", { text: `Il ${numero} al ${NOMI_GIOCO[gioco]}` })),
      el(
        "div",
        { class: "metriche" },
        metrica(String(d.ritardo), "estrazioni di ritardo"),
        metrica(String(d.ritardoMax), "ritardo massimo"),
        metrica(String(d.frequenza), `uscite (${nomeFinestra})`),
        metrica(attesa.toFixed(1), "uscite attese in media"),
      ),
      el("p", { class: "muted", text: `Ultima uscita: ${ultimaTesto}. Uscite totali nell'archivio: ${d.totaleUscite}.` }),
      d.ultimeUscite.length ? el("h3", { text: "Ultime uscite" }) : null,
      d.ultimeUscite.length
        ? el(
            "ol",
            { class: "lista-estrazioni" },
            d.ultimeUscite.map((e) =>
              el("li", {}, el("span", { class: "intestazione", text: etichettaEstrazione(e) }), palline(gioco === "extra" ? e.numeri_extra : e.numeri, { extra: gioco === "extra", centrati: [numero] })),
            ),
          )
        : null,
    ),
  );
}

// ---------- Statistiche ----------

function renderStatistiche() {
  const gioco = $("#stat-gioco").value;
  const ordine = $("#stat-ordine").value;
  const s = statisticheNumeri(stato.estrazioni, gioco, finestraSelezionata($("#stat-finestra")));
  const righe = [...s.numeri].sort((a, b) => (ordine === "numero" ? a.numero - b.numero : b[ordine] - a[ordine] || a.numero - b.numero));
  const maxFreq = Math.max(1, ...s.numeri.map((x) => x.frequenza));

  $("#stat-sintesi").textContent = `${intero.format(s.estrazioniAnalizzate)} estrazioni analizzate: in media ogni numero esce ${s.attesa.toFixed(1)} volte. Ritardi calcolati su tutto l'archivio.`;
  $("#tabella-stat tbody").replaceChildren(
    ...righe.map((x) =>
      el(
        "tr",
        {},
        el("td", {}, palline([x.numero], { extra: gioco === "extra" })),
        el("td", {}, String(x.frequenza), el("span", { class: "barra", style: `width:${Math.round((x.frequenza / maxFreq) * 60)}px` })),
        el("td", { text: String(x.ritardo) }),
        el("td", { text: String(x.ritardoMax) }),
        el("td", { class: "muted", text: x.ultima ? `${x.ultima.data.split("-").reverse().join("/")} ${x.ultima.ora}` : "—" }),
      ),
    ),
  );
}

// ---------- Sistemi ----------

function renderGriglia() {
  const griglia = $("#griglia-numeri");
  griglia.replaceChildren(
    ...Array.from({ length: MAX_NUMERO }, (_, i) => {
      const n = i + 1;
      const b = el("button", { type: "button", "aria-pressed": String(stato.selezione.has(n)), text: String(n) });
      b.addEventListener("click", () => {
        if (stato.selezione.has(n)) stato.selezione.delete(n);
        else if (stato.selezione.size < MAX_SISTEMA) stato.selezione.add(n);
        b.setAttribute("aria-pressed", String(stato.selezione.has(n)));
        renderSistema();
      });
      return b;
    }),
  );
}

function renderSistema() {
  const numeri = [...stato.selezione].sort((a, b) => a - b);
  const conExtra = $("#sistema-extra").checked;
  const riepilogo = $("#sistema-riepilogo");
  const errore = validaSelezione(numeri);
  document.querySelectorAll("#griglia-numeri button").forEach((b) => {
    b.setAttribute("aria-pressed", String(stato.selezione.has(Number(b.textContent))));
  });

  if (errore) {
    riepilogo.textContent = `${numeri.length} numeri scelti. ${errore}`;
    riepilogo.classList.toggle("errore", numeri.length > 0);
    $("#sistema-cinquine").replaceChildren();
    $("#salva-giocata").disabled = true;
    $("#backtest-risultato").replaceChildren(el("p", { class: "muted", text: "Scegli almeno 5 numeri per vedere come sarebbe andata la giocata nelle estrazioni passate." }));
    return;
  }
  riepilogo.classList.remove("errore");
  const { cinquine, costo } = costoSistema(numeri.length, conExtra);
  const tipo = numeri.length === 5 ? "Giocata singola" : `Sistema integrale da ${numeri.length} numeri`;
  riepilogo.textContent = `${tipo}: ${cinquine} ${cinquine === 1 ? "cinquina" : "cinquine"}, costo ${euro.format(costo)} per estrazione${conExtra ? " (con Extra)" : ""}.`;
  $("#titolo-cinquine").textContent = numeri.length === 5 ? "La tua giocata" : `Cinquine del sistema (${cinquine})`;
  if (numeri.length >= 5) $("#sistema-quanti").value = String(numeri.length);
  const elenco = combinazioni(numeri);
  $("#sistema-cinquine").replaceChildren(
    ...elenco.map((c, i) =>
      el("li", { "aria-label": `Cinquina ${i + 1}: ${c.join(", ")}` }, elenco.length > 1 ? el("span", { class: "indice", text: `#${i + 1}` }) : null, palline(c, { piccola: true })),
    ),
  );
  $("#salva-giocata").disabled = false;
  renderBacktest(numeri, conExtra);
}

function renderBacktest(numeri, conExtra) {
  const estrazioni = applicaFinestra(stato.estrazioni, finestraSelezionata($("#backtest-finestra")));
  const giochi = conExtra ? ["million", "extra"] : ["million"];
  const { costo } = costoSistema(numeri.length, conExtra);

  const risultati = giochi.map((gioco) => ({ gioco, r: backtest(numeri, estrazioni, gioco) }));
  const speso = costo * estrazioni.length;
  const vinto = risultati.reduce((somma, x) => somma + x.r.vincite, 0);

  const blocchi = risultati.map(({ gioco, r }) => {
    const cat = (k) => el("div", { class: "metrica" }, el("div", { class: "valore", text: intero.format(r.categorie[k]) }), el("div", { class: "nome", text: `cinquine con ${k} punti (${euro.format(PREMI[gioco][k])} l'una)` }));
    return el(
      "div",
      {},
      el("h3", { text: NOMI_GIOCO[gioco] }),
      el("div", { class: "categorie" }, [2, 3, 4, 5].map(cat)),
      el("p", { class: "muted", text: `Vincite: ${euro.format(r.vincite)}. Estrazioni con almeno una cinquina vincente: ${intero.format(r.estrazioniVincenti)} su ${intero.format(r.estrazioni)}.` }),
      r.migliori.length
        ? el(
            "ul",
            { class: "migliori" },
            r.migliori.slice(0, 5).map((m) =>
              el("li", {}, el("span", { class: "intestazione muted", text: `${etichettaEstrazione(m.estrazione)} · ${m.centrati.length} centrati` }), palline(gioco === "extra" ? m.estrazione.numeri_extra : m.estrazione.numeri, { extra: gioco === "extra", centrati: m.centrati })),
            ),
          )
        : null,
    );
  });

  const metrica = (valore, nome) => el("div", { class: "metrica" }, el("div", { class: "valore", text: valore }), el("div", { class: "nome", text: nome }));
  $("#backtest-risultato").replaceChildren(
    el("p", { text: `Se avessi giocato questi numeri in ognuna delle ${intero.format(estrazioni.length)} estrazioni:` }),
    el("div", { class: "metriche" }, metrica(euro.format(speso), "spesa"), metrica(euro.format(vinto), "vincite"), metrica(euro.format(vinto - speso), "saldo")),
    ...blocchi,
    el("p", { class: "muted", text: "Vincite lorde secondo la tabella premi (2, 3, 4 e 5 numeri indovinati per cinquina), senza eventuali ritenute fiscali." }),
  );
}

// ---------- Giocate salvate ----------

const formatoBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });

function confrontoUltima(g) {
  const ultima = stato.estrazioni.at(-1);
  if (!ultima) return { testo: "", centrati: [] };
  const centrati = g.numeri.filter((n) => ultima.numeri.includes(n));
  const centratiExtra = g.numeri.filter((n) => ultima.numeri_extra.includes(n));
  let testo = `Ultima estrazione (${ultima.data.split("-").reverse().join("/")} ${ultima.ora}): ${centrati.length} al Million Day`;
  if (g.conExtra) testo += `, ${centratiExtra.length} all'Extra`;
  return { testo: `${testo}.`, centrati: g.conExtra ? [...new Set([...centrati, ...centratiExtra])] : centrati };
}

function renderGiocateSalvate() {
  const giocate = leggiGiocate();
  const lista = $("#giocate-salvate");
  if (!giocate.length) {
    lista.replaceChildren(el("li", { class: "muted", text: "Nessuna giocata salvata. Scegli i numeri e premi «Salva giocata»." }));
    return;
  }
  lista.replaceChildren(
    ...giocate.map((g) => {
      const { cinquine, costo } = costoSistema(g.numeri.length, g.conExtra);
      const tipo = g.numeri.length === 5 ? "Giocata singola" : `Sistema da ${g.numeri.length} numeri, ${cinquine} cinquine`;
      const confronto = confrontoUltima(g);
      const usa = el("button", { type: "button", class: "secondario", text: "Usa" });
      usa.addEventListener("click", () => {
        stato.selezione = new Set(g.numeri);
        $("#sistema-extra").checked = g.conExtra;
        $("#salva-nome").value = g.nome;
        renderSistema();
        $("#vista-sistemi").scrollIntoView({ behavior: "smooth" });
      });
      const elimina = el("button", { type: "button", class: "pericolo", text: "Elimina" });
      elimina.addEventListener("click", () => {
        if (!confirm(`Eliminare «${g.nome || g.numeri.join(" ")}»?`)) return;
        eliminaGiocata(g.id);
        renderGiocateSalvate();
      });
      return el(
        "li",
        {},
        el("div", {}, el("span", { class: "titolo", text: g.nome || `Giocata del ${formatoBreve.format(new Date(g.creata))}` }), g.conExtra ? el("span", { class: "tag", text: "Extra" }) : null),
        palline(g.numeri, { centrati: confronto.centrati }),
        el("span", { class: "muted", text: `${tipo} · ${euro.format(costo)} per estrazione` }),
        confronto.testo ? el("span", { class: "muted", text: confronto.testo }) : null,
        el("div", { class: "azioni" }, usa, elimina),
      );
    }),
  );
}

function salvaSelezione(evento) {
  evento.preventDefault();
  const esito = $("#salva-esito");
  try {
    const g = salvaGiocata({ numeri: [...stato.selezione], conExtra: $("#sistema-extra").checked, nome: $("#salva-nome").value });
    esito.textContent = `Salvata: ${g.nome || g.numeri.join(" ")}.`;
    $("#salva-nome").value = "";
    renderGiocateSalvate();
  } catch (err) {
    esito.textContent = err instanceof Error ? err.message : "Salvataggio non riuscito.";
  }
}

function selezioneCasuale() {
  const quanti = Number($("#sistema-quanti").value);
  const scelti = new Set();
  const casuale = new Uint32Array(1);
  while (scelti.size < quanti) {
    crypto.getRandomValues(casuale);
    scelti.add((casuale[0] % MAX_NUMERO) + 1);
  }
  stato.selezione = scelti;
  renderSistema();
}

// ---------- avvio ----------

function popolaFinestre() {
  document.querySelectorAll(".select-finestra").forEach((select) => {
    select.replaceChildren(...FINESTRE.map((f) => el("option", { value: f.id, text: f.nome })));
    select.value = "tutte";
  });
}

async function caricaDati() {
  const risposta = await fetch(URL_DATI, { cache: "no-cache" });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
  return risposta.json();
}

async function avvia() {
  popolaFinestre();
  renderGriglia();

  document.querySelectorAll(".tabbar button").forEach((b) => b.addEventListener("click", () => mostraVista(b.dataset.tab)));
  $("#filtro-data").addEventListener("input", renderLista);
  $("#filtro-anno").addEventListener("change", () => {
    stato.mostrate = PAGINA_LISTA;
    renderLista();
  });
  $("#altre-estrazioni").addEventListener("click", () => {
    stato.mostrate += PAGINA_LISTA;
    renderLista();
  });
  $("#form-numero").addEventListener("submit", renderNumero);
  ["#numero-gioco", "#numero-finestra"].forEach((s) => $(s).addEventListener("change", () => $("#input-numero").value && renderNumero()));
  ["#stat-gioco", "#stat-finestra", "#stat-ordine"].forEach((s) => $(s).addEventListener("change", renderStatistiche));
  $("#sistema-extra").addEventListener("change", renderSistema);
  $("#backtest-finestra").addEventListener("change", renderSistema);
  $("#sistema-casuale").addEventListener("click", selezioneCasuale);
  $("#form-salva").addEventListener("submit", salvaSelezione);
  $("#sistema-azzera").addEventListener("click", () => {
    stato.selezione.clear();
    renderSistema();
  });

  const iniziale = location.hash.slice(1);
  mostraVista(["estrazioni", "numeri", "statistiche", "sistemi"].includes(iniziale) ? iniziale : "estrazioni");

  renderGiocateSalvate(); // visibili anche se l'archivio non si carica
  try {
    const dati = await caricaDati();
    stato.estrazioni = ordina(dati.estrazioni);
    const aggiornato = dati.aggiornato ? new Date(dati.aggiornato).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" }) : "n.d.";
    $("#stato-dati").textContent = `${intero.format(stato.estrazioni.length)} estrazioni · aggiornato ${aggiornato}`;
  } catch (err) {
    $("#stato-dati").textContent = "Impossibile caricare l'archivio. Riprova quando sei online.";
    console.error(err);
    return;
  }
  renderUltima();
  renderGiocateSalvate();
  popolaAnni();
  renderLista();
  renderStatistiche();
  renderSistema();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.error));
}

avvia();
