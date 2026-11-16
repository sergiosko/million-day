-- Archivio delle estrazioni. Il numero di concorso riparte da 1 ogni anno,
-- quindi la chiave è la coppia (anno, concorso).
CREATE TABLE estrazioni (
  anno         INTEGER NOT NULL,
  concorso     INTEGER NOT NULL,
  data         TEXT    NOT NULL,            -- aaaa-mm-gg
  ora          TEXT    NOT NULL,            -- 13:00 | 20:30
  numeri       TEXT    NOT NULL,            -- JSON: cinque numeri del Million Day
  numeri_extra TEXT    NOT NULL,            -- JSON: cinque numeri dell'Extra
  PRIMARY KEY (anno, concorso)
);

CREATE INDEX estrazioni_data ON estrazioni (data);

-- Stato dell'aggiornamento automatico (ultimo controllo, ultimo errore, ...).
CREATE TABLE meta (
  chiave TEXT PRIMARY KEY,
  valore TEXT NOT NULL
);
