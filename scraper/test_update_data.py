"""Test dell'unione delle estrazioni nel JSON dell'app."""

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import update_data  # noqa: E402

FIXTURE = os.path.join(HERE, "..", "tests", "fixtures", "archivio-2026.mht")


def estrazione(concorso, numeri=(1, 2, 3, 4, 5)):
    return {
        "anno": 2026,
        "concorso": concorso,
        "data": "2026-01-01",
        "numeri": list(numeri),
        "numeri_extra": [6, 7, 8, 9, 10],
    }


class MergeTest(unittest.TestCase):
    def test_aggiunge_e_ordina(self):
        dati = {"estrazioni": []}
        aggiunte, modificate = update_data.merge(dati, [estrazione(2), estrazione(1)])
        self.assertEqual(sorted(aggiunte), [(2026, 1), (2026, 2)])
        self.assertEqual(modificate, [])
        self.assertEqual([e["concorso"] for e in dati["estrazioni"]], [1, 2])
        self.assertEqual(dati["estrazioni"][0]["ora"], "13:00")
        self.assertEqual(dati["estrazioni"][1]["ora"], "20:30")

    def test_idempotente(self):
        dati = {"estrazioni": []}
        update_data.merge(dati, [estrazione(1)])
        aggiunte, modificate = update_data.merge(dati, [estrazione(1)])
        self.assertEqual((aggiunte, modificate), ([], []))
        self.assertEqual(len(dati["estrazioni"]), 1)

    def test_segnala_modifiche(self):
        dati = {"estrazioni": []}
        update_data.merge(dati, [estrazione(1)])
        _, modificate = update_data.merge(dati, [estrazione(1, (1, 2, 3, 4, 6))])
        self.assertEqual(modificate, [(2026, 1)])
        self.assertEqual(dati["estrazioni"][0]["numeri"], [1, 2, 3, 4, 6])

    def test_import_da_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "estrazioni.json")
            self.assertEqual(update_data.main(["--file", FIXTURE, "--data", path]), 0)
            dati = update_data.load(path)
            self.assertEqual(len(dati["estrazioni"]), 636)
            self.assertIsNotNone(dati["aggiornato"])


if __name__ == "__main__":
    unittest.main()
