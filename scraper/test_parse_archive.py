"""Test del parser sull'archivio 2026 salvato dal browser (tests/fixtures)."""

import datetime as dt
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from parse_archive import _day_for_concorso, parse_archive  # noqa: E402

FIXTURE = os.path.join(HERE, "..", "tests", "fixtures", "archivio-2026.mht")


class CalendarioTest(unittest.TestCase):
    def test_coppie_di_concorsi_per_giorno(self):
        self.assertEqual(_day_for_concorso(2026, 1), dt.date(2026, 1, 1))
        self.assertEqual(_day_for_concorso(2026, 2), dt.date(2026, 1, 1))
        self.assertEqual(_day_for_concorso(2026, 3), dt.date(2026, 1, 2))
        self.assertEqual(_day_for_concorso(2026, 632), dt.date(2026, 11, 12))
        self.assertEqual(_day_for_concorso(2026, 636), dt.date(2026, 11, 14))


class ArchivioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIXTURE, encoding="utf-8", errors="replace") as fh:
            cls.result = parse_archive(fh.read())
        cls.estrazioni = cls.result["estrazioni"]
        cls.per_concorso = {e["concorso"]: e for e in cls.estrazioni}

    def test_anno(self):
        self.assertEqual(self.result["anno"], 2026)

    def test_nessun_avviso(self):
        self.assertEqual(self.result["avvisi"], [])

    def test_636_estrazioni_consecutive(self):
        self.assertEqual(len(self.estrazioni), 636)
        self.assertEqual([e["concorso"] for e in self.estrazioni], list(range(1, 637)))

    def test_cinque_numeri_per_gioco(self):
        for e in self.estrazioni:
            with self.subTest(concorso=e["concorso"]):
                self.assertEqual(len(e["numeri"]), 5)
                self.assertEqual(len(set(e["numeri"])), 5)
                self.assertEqual(len(e["numeri_extra"]), 5)
                self.assertEqual(len(set(e["numeri_extra"])), 5)
                self.assertTrue(all(1 <= n <= 55 for n in e["numeri"] + e["numeri_extra"]))

    def test_date(self):
        self.assertEqual(self.per_concorso[1]["data"], "2026-01-01")
        self.assertEqual(self.per_concorso[632]["data"], "2026-11-12")
        self.assertEqual(self.per_concorso[636]["data"], "2026-11-14")

    def test_estrazione_636_come_in_pagina(self):
        e = self.per_concorso[636]
        self.assertEqual(e["numeri"], [1, 21, 27, 28, 29])
        self.assertEqual(e["numeri_extra"], [10, 22, 24, 45, 53])
        self.assertEqual(e["data_fonte"], "calcolata")  # riga "Oggi", senza data in chiaro

    def test_estrazione_632_con_data_in_pagina(self):
        e = self.per_concorso[632]
        self.assertEqual(e["numeri"], [4, 19, 20, 36, 52])
        self.assertEqual(e["numeri_extra"], [5, 9, 18, 27, 33])
        self.assertEqual(e["data_fonte"], "pagina")


if __name__ == "__main__":
    unittest.main()
