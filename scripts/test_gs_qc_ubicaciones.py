#!/usr/bin/env python3
"""Regresiones locales de ubicaciones QC Túnel; nunca accede a GS/Firebase."""
from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gs_qc_import import _merge_gs, _tunnel_rows


class TestTunelUbicaciones(unittest.TestCase):
    @staticmethod
    def fila(source_id, fecha, bandejas, calle):
        return {
            "gs_injerto_id": source_id,
            "gs_partida": "26X02342",
            "cliente": "CLIENTE PRUEBA",
            "tipo_siembra": "VARIEDAD PRUEBA",
            "bandejas": bandejas,
            "PAR_CAS": "064",
            "PIN_LOCA": calle,
            "fecha_prevista": fecha,
            "observaciones": "Texto que no debe utilizarse como ubicación",
        }

    def test_dos_fechas_no_se_mezclan(self):
        casos = [
            ("2026-11-09", "gs-09", 37, 27),
            ("2026-11-11", "gs-11", 6, 30),
        ]
        ids = set()
        for fecha, source_id, bandejas, calle in casos:
            with self.subTest(fecha=fecha):
                rows = _tunnel_rows(
                    {"partes": {source_id: self.fila(source_id, fecha, bandejas, calle)}},
                    date.fromisoformat(fecha),
                )
                self.assertEqual(len(rows), 1)
                row = rows[0]
                item = row["item"]
                ids.add(item["id"])
                self.assertEqual(row["source_id"], source_id)
                self.assertEqual(item["partida"], "26X02342")
                self.assertEqual(item["numBandejas"], str(bandejas))
                self.assertEqual(item["PAR_CAS"], "064")
                self.assertEqual(item["PIN_LOCA"], str(calle))
                self.assertEqual(item["invId"], "064")
                self.assertEqual(item["calleDesde"], str(calle))
                self.assertEqual(item["calleHasta"], str(calle))
                self.assertEqual(item["gsDetalles"]["PIN_LOCA"], str(calle))
                self.assertEqual(item["origenGS"]["fechaISO"], fecha)
        self.assertEqual(len(ids), 2)

    def test_actualizacion_rellena_ubicacion_vacia(self):
        incoming = _tunnel_rows(
            {"partes": {"gs-11": self.fila("gs-11", "2026-11-11", 6, 30)}},
            date(2026, 11, 11),
        )[0]["item"]
        existing = {
            "id": incoming["id"], "tipo": "tunel",
            "invId": None, "calleDesde": None, "calleHasta": None,
            "color": {"verde": 100}, "observaciones": "Revisión manual",
            "fotos": ["foto-existente"],
        }
        merged = _merge_gs(existing, incoming)
        self.assertEqual(merged["invId"], "064")
        self.assertEqual(merged["calleDesde"], "30")
        self.assertEqual(merged["calleHasta"], "30")
        self.assertEqual(merged["color"], {"verde": 100})
        self.assertEqual(merged["observaciones"], "Revisión manual")
        self.assertEqual(merged["fotos"], ["foto-existente"])

    def test_no_pisa_ubicacion_manual(self):
        incoming = _tunnel_rows(
            {"partes": {"gs-09": self.fila("gs-09", "2026-11-09", 37, 27)}},
            date(2026, 11, 9),
        )[0]["item"]
        existing = {
            "invId": "1A", "calleDesde": "15", "calleHasta": "16",
            "tramos": [{"desde": 15, "hasta": 16}],
        }
        merged = _merge_gs(existing, incoming)
        for field in ("invId", "calleDesde", "calleHasta", "tramos"):
            self.assertEqual(merged[field], existing[field])
        self.assertEqual(merged["PAR_CAS"], "064")
        self.assertEqual(merged["PIN_LOCA"], "27")

    def test_calle_cero_no_se_asigna(self):
        incoming = _tunnel_rows(
            {"partes": {"gs-0": self.fila("gs-0", "2026-11-09", 37, 0)}},
            date(2026, 11, 9),
        )[0]["item"]
        self.assertEqual(incoming["PIN_LOCA"], "0")
        self.assertIsNone(incoming["calleDesde"])
        self.assertIsNone(incoming["calleHasta"])


if __name__ == "__main__":
    unittest.main()
