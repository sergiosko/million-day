# Million Day

PWA personale con l'archivio delle estrazioni del Million Day, la ricerca per numero,
le statistiche (frequenza e ritardo) e i sistemi integrali con backtest.

- `web/` – l'app statica (HTML, CSS, JS senza dipendenze) pubblicata su GitHub Pages.
- `web/data/estrazioni.json` – l'archivio usato dall'app.
- `scraper/` – parser e aggiornamento dell'archivio da archiviomillionday.it.
- `.github/workflows/` – aggiornamento automatico dopo ogni estrazione e pubblicazione.

## Comandi

```sh
npm test                                              # test JS e Python
python3 -I scraper/update_data.py                     # scarica l'anno corrente
python3 -I scraper/update_data.py --file anno.mht     # importa uno snapshot salvato dal browser
cd web && python3 -m http.server 8000                 # prova locale su http://localhost:8000
```

Le estrazioni sono casuali e indipendenti: statistiche e backtest descrivono il passato
e non aumentano le probabilità di vincita.
