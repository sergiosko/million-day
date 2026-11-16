# Million Day

Glossario del dominio per l'app di archivio e statistiche del Million Day.

## Termini

**Estrazione**: un singolo sorteggio del Million Day, con orario fisso (13:00 o 20:30). Ogni estrazione contiene due giochi: il Million Day principale e l'Extra Million Day.

**Numeri estratti**: i cinque numeri di un'estrazione per gioco.

**Giocata**: una schedina scelta dal giocatore con uno o più numeri.

**Giocata sistemistica (Sistema)**: giocata che copre più combinazioni a partire da un insieme di numeri scelti (fino a 9 complessivi, secondo le regole pubblicate).

**Giocata salvata**: una Giocata o un Sistema che il giocatore conserva sul proprio dispositivo per riusarlo o confrontarlo con le nuove estrazioni.

**Ritardo**: numero di estrazioni consecutive trascorse dall'ultima uscita di un numero.

**Frequenza**: numero di volte in cui un numero è uscito in una finestra di estrazioni (ultime N, ultimi mesi, storico completo).

**Backtest**: simulazione di una giocata o di un sistema applicata alle estrazioni passate, con esiti per numero di numeri centrati e costo complessivo. Non indica risultati futuri.

**Archivio**: l'insieme delle estrazioni storiche raccolte dalla fonte (archiviomillionday.it).

**Concorso**: numero progressivo di un'estrazione, usato come chiave univoca per evitare duplicati.

## Relazioni

- Una Estrazione contiene due giochi: Million Day ed Extra Million Day.
- Una Giocata sistemistica genera più combinazioni, ciascuna valutabile nel Backtest.
