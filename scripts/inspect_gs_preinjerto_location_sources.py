#!/usr/bin/env python3
"""Read-only, indexed lookup for Preinjerto locations in GS.

Reads the two approved partidas by primary key, checks whether p-injertos.PIN_PAR
has a leading index, and only then looks up those exact IDs. It skips an
unindexed source rather than triggering a full-table scan. No Firebase access.
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
                SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = %s
                  AND TABLE_NAME = 'p-injertos'
                ORDER BY INDEX_NAME, SEQ_IN_INDEX
                """,
                (MYSQL_DATABASE,),
            )
            indexes = cursor.fetchall()
            has_pin_par_leading_index = any(
                row["COLUMN_NAME"] == "PIN_PAR" and int(row["SEQ_IN_INDEX"]) == 1
                for row in indexes
            )

            if has_pin_par_leading_index:
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
                injertos: dict[str, Any] = {
                    "status": "consultado_por_indice",
                    "rows": cursor.fetchall(),
                }
            else:
                injertos = {
                    "status": "omitido_sin_indice_lider_PIN_PAR",
                    "rows": [],
                }

            print(json.dumps({
                "database": MYSQL_DATABASE,
                "targets": list(TARGETS),
                "partidas": partidas,
                "p_injertos": injertos,
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
