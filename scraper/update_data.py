"""Aggiorna web/data/estrazioni.json con le estrazioni dell'archivio.

Senza argomenti scarica la pagina dell'anno corrente da archiviomillionday.it.
Con --file importa uno o più snapshot salvati dal browser (.mht o .html),
utile per gli anni precedenti.

Uso:
    python3 -I scraper/update_data.py
    python3 -I scraper/update_data.py --file archivio-2025.mht archivio-2024.mht
"""

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_archive import parse_archive  # noqa: E402

URL = "https://www.archiviomillionday.it/archivio-million-day.amp.php"
USER_AGENT = "million-day-archivio/1.0 (uso personale; github.com/sergiosko/million-day)"
DEFAULT_DATA = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "web", "data", "estrazioni.json"
)


def fetch(url: str = URL, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def ora_per_concorso(concorso: int) -> str:
    """Due estrazioni al giorno: il concorso dispari è delle 13:00, il pari delle 20:30."""
    return "13:00" if concorso % 2 == 1 else "20:30"


def load(path: str) -> dict:
    if not os.path.exists(path):
        return {"fonte": "archiviomillionday.it", "aggiornato": None, "estrazioni": []}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def merge(dati: dict, nuove: list) -> tuple:
    """Unisce le estrazioni per (anno, concorso). Restituisce (aggiunte, modificate)."""
    indice = {(e["anno"], e["concorso"]): e for e in dati["estrazioni"]}
    aggiunte, modificate = [], []
    for e in nuove:
        voce = {
            "anno": e["anno"],
            "concorso": e["concorso"],
            "data": e["data"],
            "ora": ora_per_concorso(e["concorso"]),
            "numeri": e["numeri"],
            "numeri_extra": e["numeri_extra"],
        }
        chiave = (voce["anno"], voce["concorso"])
        esistente = indice.get(chiave)
        if esistente is None:
            aggiunte.append(chiave)
        elif esistente != voce:
            modificate.append(chiave)
        indice[chiave] = voce
    dati["estrazioni"] = [indice[k] for k in sorted(indice)]
    return aggiunte, modificate


def save(dati: dict, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(dati, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    os.replace(tmp, path)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--file", nargs="+", help="snapshot .mht/.html da importare al posto del download")
    p.add_argument("--data", default=DEFAULT_DATA, help="percorso del JSON delle estrazioni")
    args = p.parse_args(argv)

    pagine = []
    if args.file:
        for nome in args.file:
            with open(nome, encoding="utf-8", errors="replace") as fh:
                pagine.append((nome, fh.read()))
    else:
        pagine.append((URL, fetch()))

    dati = load(args.data)
    errori = 0
    totale_aggiunte = 0
    for origine, raw in pagine:
        risultato = parse_archive(raw)
        for avviso in risultato["avvisi"]:
            print(f"avviso [{origine}]: {avviso}", file=sys.stderr)
        if not risultato["estrazioni"]:
            print(f"errore [{origine}]: nessuna estrazione trovata", file=sys.stderr)
            errori += 1
            continue
        aggiunte, modificate = merge(dati, risultato["estrazioni"])
        totale_aggiunte += len(aggiunte)
        print(
            f"{origine}: anno {risultato['anno']}, {len(risultato['estrazioni'])} estrazioni lette, "
            f"{len(aggiunte)} nuove, {len(modificate)} modificate"
        )
        for anno, concorso in modificate:
            print(f"avviso: estrazione {anno}/{concorso} cambiata rispetto all'archivio salvato", file=sys.stderr)

    if totale_aggiunte or not os.path.exists(args.data) or args.file:
        dati["aggiornato"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
        save(dati, args.data)
    return 1 if errori else 0


if __name__ == "__main__":
    sys.exit(main())
