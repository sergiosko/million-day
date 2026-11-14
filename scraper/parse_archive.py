"""Parser per le pagine di archivio di archiviomillionday.it.

Accetta l'HTML della pagina oppure lo snapshot .mht salvato dal browser e
restituisce le estrazioni come dizionari.

Uso:
    python3 -I scraper/parse_archive.py FILE [-o OUTPUT.json]
"""

import argparse
import datetime as dt
import json
import re
import sys
from html.parser import HTMLParser

SOURCE = "archiviomillionday.it"
DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
HREF_DATE_RE = re.compile(r"del-(\d{1,2})-(\d{1,2})-(\d{4})-concorso-(\d+)")
YEAR_RE = re.compile(r"Archivio estrazioni Million Day\s*-\s*(\d{4})")
MHT_HTML_START = "<!DOCTYPE html"
MHT_BOUNDARY = "\n------MultipartBoundary"


class _ArchiveTableParser(HTMLParser):
    """Raccoglie le celle delle righe della tabella con classe 'tba'."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.caption = ""
        self.rows = []
        self._in_table = False
        self._in_caption = False
        self._row = None
        self._cell = None
        self._in_span = False
        self._span_text = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table" and "tba" in (attrs.get("class") or "").split():
            self._in_table = True
        elif not self._in_table:
            return
        elif tag == "caption":
            self._in_caption = True
        elif tag == "tr":
            self._row = []
        elif tag == "td" and self._row is not None:
            self._cell = {"href": None, "numbers": [], "text": ""}
        elif tag == "a" and self._cell is not None and self._cell["href"] is None:
            self._cell["href"] = attrs.get("href")
        elif tag == "span" and self._cell is not None:
            self._in_span = True
            self._span_text = ""

    def handle_endtag(self, tag):
        if not self._in_table:
            return
        if tag == "table":
            self._in_table = False
        elif tag == "caption":
            self._in_caption = False
        elif tag == "span" and self._in_span:
            self._cell["numbers"].append(self._span_text.strip())
            self._in_span = False
        elif tag == "td" and self._cell is not None:
            self._row.append(self._cell)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:  # le righe di intestazione non hanno celle td
                self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._in_caption:
            self.caption += data
        if self._in_span:
            self._span_text += data
        elif self._cell is not None:
            self._cell["text"] += data


def extract_html(raw: str) -> str:
    """Restituisce l'HTML della pagina, anche da uno snapshot .mht."""
    start = raw.find(MHT_HTML_START)
    if start == -1:
        return raw
    end = raw.find(MHT_BOUNDARY, start)
    return raw[start:] if end == -1 else raw[start:end]


def _day_for_concorso(anno: int, concorso: int) -> dt.date:
    """Due estrazioni al giorno: i concorsi 1-2 cadono il 1 gennaio, 3-4 il 2 gennaio, e così via."""
    return dt.date(anno, 1, 1) + dt.timedelta(days=(concorso + 1) // 2 - 1)


def _numbers(cell: dict, avvisi: list, etichetta: str) -> list:
    valori = []
    for testo in cell["numbers"]:
        try:
            valori.append(int(testo))
        except ValueError:
            avvisi.append(f"{etichetta}: valore non numerico {testo!r}")
    return valori


def parse_archive(raw: str) -> dict:
    """Converte la pagina di archivio in un dizionario con le estrazioni dell'anno."""
    parser = _ArchiveTableParser()
    parser.feed(extract_html(raw))

    m = YEAR_RE.search(parser.caption)
    if not m:
        raise ValueError("Anno non trovato nella didascalia della tabella")
    anno = int(m.group(1))

    avvisi = []
    estrazioni = []
    for row in parser.rows:
        if len(row) != 4:
            avvisi.append(f"riga scartata: {len(row)} celle invece di 4")
            continue
        data_cell, conc_cell, principali_cell, extra_cell = row

        try:
            concorso = int(conc_cell["text"].strip())
        except ValueError:
            avvisi.append(f"concorso non valido: {conc_cell['text'].strip()!r}")
            continue

        # La data è in chiaro (gg/mm/aaaa) oppure "Oggi"/"Ieri": in quel caso
        # la ricaviamo dal numero di concorso, dopo averla letta dal link se presente.
        testo_data = data_cell["text"].strip()
        data_pagina = None
        dm = DATE_RE.match(testo_data)
        if dm:
            data_pagina = dt.date(int(dm[3]), int(dm[2]), int(dm[1]))
        else:
            hm = HREF_DATE_RE.search(data_cell["href"] or "")
            if hm:
                data_pagina = dt.date(int(hm[3]), int(hm[2]), int(hm[1]))

        data_calcolata = _day_for_concorso(anno, concorso)
        if data_pagina is not None and data_pagina != data_calcolata:
            avvisi.append(
                f"concorso {concorso}: data in pagina {data_pagina} "
                f"diversa da quella calcolata {data_calcolata}"
            )

        numeri = _numbers(principali_cell, avvisi, f"concorso {concorso} numeri")
        numeri_extra = _numbers(extra_cell, avvisi, f"concorso {concorso} extra")
        if len(numeri) != 5 or len(set(numeri)) != 5:
            avvisi.append(f"concorso {concorso}: numeri principali non validi {numeri}")
        if len(numeri_extra) != 5 or len(set(numeri_extra)) != 5:
            avvisi.append(f"concorso {concorso}: numeri extra non validi {numeri_extra}")

        estrazioni.append(
            {
                "anno": anno,
                "concorso": concorso,
                "data": data_calcolata.isoformat(),
                "data_fonte": "pagina" if data_pagina else "calcolata",
                "numeri": numeri,
                "numeri_extra": numeri_extra,
            }
        )

    estrazioni.sort(key=lambda e: e["concorso"])
    return {"fonte": SOURCE, "anno": anno, "estrazioni": estrazioni, "avvisi": avvisi}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Estrae le estrazioni da una pagina di archivio.")
    p.add_argument("file", help="file HTML o .mht salvato dalla pagina di archivio")
    p.add_argument("-o", "--output", help="file JSON di output (default: stdout)")
    args = p.parse_args(argv)

    with open(args.file, encoding="utf-8", errors="replace") as fh:
        risultato = parse_archive(fh.read())

    out = json.dumps(risultato, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(out + "\n")
    else:
        print(out)
    for avviso in risultato["avvisi"]:
        print(f"avviso: {avviso}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
