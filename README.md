# Million Day

PWA personale con l'archivio delle estrazioni del Million Day, la ricerca per numero,
le statistiche (frequenza e ritardo) e i sistemi integrali con backtest.
Gira su **Cloudflare Workers + D1**; l'archivio si aggiorna da solo con un Cron Trigger.

## Struttura
- `src/index.ts` — Worker: API `/api/*` e aggiornamento pianificato da archiviomillionday.it
- `src/parser.ts` — parser della pagina di archivio (usato da Worker, seed e test)
- `public/` — frontend (HTML, CSS, JS senza dipendenze, service worker)
- `migrations/` — schema D1
- `scripts/mht-to-sql.mjs` — genera `seed.sql` dagli snapshot `.mht` dell'archivio
- `tests/` — test di parser e logica, con lo snapshot 2026 come fixture
- `CONTEXT.md` — glossario del dominio

## Setup
```bash
npm install
npx wrangler d1 create million-day            # poi copia database_id in wrangler.jsonc
npx wrangler d1 migrations apply million-day --remote
npm run seed && npx wrangler d1 execute million-day --remote --file seed.sql   # opzionale
npm run deploy
```
Senza seed l'archivio dell'anno in corso arriva al primo Cron Trigger (dopo le 13:00 e
dopo le 20:30). Per gli anni precedenti salva la pagina dell'anno dal browser e importala:
```bash
npm run seed -- archivio-2025.mht archivio-2024.mht
npx wrangler d1 execute million-day --remote --file seed.sql
```

## API
- `GET /api/estrazioni` — tutto l'archivio
- `GET /api/stato` — numero di estrazioni, ultimo controllo della fonte ed eventuale errore

## Sviluppo locale
```bash
npx wrangler d1 migrations apply million-day --local
npm run seed && npx wrangler d1 execute million-day --local --file seed.sql
npm run dev
npm test && npm run typecheck
```

## Backup
```bash
npx wrangler d1 export million-day --remote --output backup.sql
```

Le estrazioni sono casuali e indipendenti: statistiche e backtest descrivono il passato
e non aumentano le probabilità di vincita.
