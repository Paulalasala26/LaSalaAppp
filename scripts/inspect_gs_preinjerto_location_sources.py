#!/usr/bin/env python3
"""Read-only, indexed lookup for Preinjerto locations in GS.

Checks only the two target IDs. It inspects indexes on p-injertos and
p-injertos_pin_comp, and runs exact lookups only when the searched key is the
leading column of an index. Unindexed tables are skipped to avoid full scans.
No Firebase access.
"""
from __future__ import annotations

import json
import sys
from typing import Any

try:
    import mysql.connector
except ImportError:
    print("Falta mysql-connector-python. Instálalo en el entorno .venv.", file=sys.stderr)
    raise SystemExit(2)

from pilot_gs_qc_preinjerto import MYSQL_DATABASE, MYSQL_HOST, MYSQL_PORT, get_mysql_credentials

TARGETS = ("26C02436", "26C02653")
TABLES = ("p-injertos", "p-injertos_pin_comp")


def leading_index(indexes: list[dict[str, Any]], column: str) -> bool:
    return any(row["COLUMN_NAME"] == column and int(row["SEQ_IN_INDEX"]) == 1 for row in indexes)


def main() -> int:
    user, password = get_mysql_credentials()
    connection = mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        database=MYSQL_DATABASE,
        user=user,
        password=password,
        connection_timeout=10,
        charset="utf8mb4",
        use_unicode=True,
        autocommit=True,
    )
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT id, PAR_CAS, PAR_UBIC, PAR_TSI, PAR_FECS
                FROM partidas
                WHERE id IN (%s, %s)
                """,
                TARGETS,
            )
            partidas = cursor.fetchall()

            cursor.execute(
                """
                SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = %s
                  AND TABLE_NAME IN (%s, %s)
                ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
                """,
                (MYSQL_DATABASE, *TABLES),
            )
            all_indexes = cursor.fetchall()
            by_table: dict[str, list[dict[str, Any]]] = {name: [] for name in TABLES}
            for row in all_indexes:
                by_table[row["TABLE_NAME"]].append(row)

            if leading_index(by_table["p-injertos"], "PIN_PAR"):
                cursor.execute(
                    """
                    SELECT id, PIN_PAR AS partida, PIN_FECP AS fecha,
                           PIN_LOCA AS ubicacion, PIN_NBAN AS bandejas
                    FROM `p-injertos`
                    WHERE PIN_PAR IN (%s, %s)
                    LIMIT 20
                    """,
                    TARGETS,
                )
                pin_rows = cursor.fetchall()
                pin_status = "consultado_por_indice"
            else:
                pin_rows = []
                pin_status = "omitido_sin_indice_lider_PIN_PAR"

            if leading_index(by_table["p-injertos_pin_comp"], "C0"):
                cursor.execute(
                    """
                    SELECT id AS id_parte_injerto, id2,
                           C0 AS partida_componente,
                           C3 AS id_invernadero, C4 AS calle_desde, C5 AS calle_hasta
                    FROM `p-injertos_pin_comp`
                    WHERE C0 IN (%s, %s)
                    LIMIT 20
                    """,
                    TARGETS,
                )
                comp_rows = cursor.fetchall()
                comp_status = "consultado_por_indice"
            else:
                comp_rows = []
                comp_status = "omitido_sin_indice_lider_C0"

            print(json.dumps({
                "database": MYSQL_DATABASE,
                "targets": list(TARGETS),
                "partidas": partidas,
                "p_injertos": {
                    "status": pin_status,
                    "leadingIndexColumns": sorted({
                        row["COLUMN_NAME"] for row in by_table["p-injertos"]
                        if int(row["SEQ_IN_INDEX"]) == 1
                    }),
                    "rows": pin_rows,
                },
                "p_injertos_pin_comp": {
                    "status": comp_status,
                    "leadingIndexColumns": sorted({
                        row["COLUMN_NAME"] for row in by_table["p-injertos_pin_comp"]
                        if int(row["SEQ_IN_INDEX"]) == 1
                    }),
                    "rows": comp_rows,
                },
                "readOnly": True,
                "firebase": "sin_acceso",
            }, ensure_ascii=False, indent=2, default=str))
            return 0
        finally:
            cursor.close()
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
