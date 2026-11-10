#!/usr/bin/env python3
"""Read-only inspection of candidate Preinjerto location table in GS.

Inspects the schema of sala12.partidas_par_ubic and searches only for the two
approved partida IDs in plausible text key columns. It never writes to GS or
Firebase and does not scan/export the full table.
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

from pilot_gs_qc_preinjerto import (
    MYSQL_DATABASE,
    MYSQL_DEFAULT_USER,
    MYSQL_HOST,
    MYSQL_PORT,
    get_mysql_credentials,
)

TABLE = "partidas_par_ubic"
TARGETS = ("26C02436", "26C02653")
TEXT_TYPES = {"char", "varchar", "tinytext", "text", "mediumtext", "longtext", "enum", "set"}


def main() -> int:
    user, password = get_mysql_credentials()
    connection = mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        database=MYSQL_DATABASE,
        user=user,
        password=password,
        connection_timeout=20,
        charset="utf8mb4",
        use_unicode=True,
        autocommit=True,
    )
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(
                """
                SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
                """,
                (MYSQL_DATABASE, TABLE),
            )
            columns = cursor.fetchall()
            if not columns:
                print(json.dumps({
                    "database": MYSQL_DATABASE,
                    "table": TABLE,
                    "exists": False,
                    "message": "La tabla no existe o no es visible para este usuario MySQL.",
                }, ensure_ascii=False, indent=2))
                return 0

            text_columns = [
                str(row["COLUMN_NAME"])
                for row in columns
                if str(row["DATA_TYPE"]).casefold() in TEXT_TYPES
            ]
            # GS sometimes exposes custom table columns as C0/C1/...;
            # search every text column with exact ID equality so a generic
            # column such as C0 is not silently skipped.
            matches: list[dict[str, Any]] = []
            searched: list[str] = []
            for name in text_columns:
                escaped = name.replace("`", "``")
                query = (
                    f"SELECT * FROM `{MYSQL_DATABASE}`.`{TABLE}` "
                    f"WHERE `{escaped}` IN (%s, %s) LIMIT 20"
                )
                try:
                    cursor.execute(query, TARGETS)
                    rows = cursor.fetchall()
                except mysql.connector.Error as exc:
                    matches.append({
                        "searchColumn": name,
                        "queryError": str(exc),
                    })
                    continue
                searched.append(name)
                for row in rows:
                    matches.append({"matchedBy": name, "row": row})

            result = {
                "database": MYSQL_DATABASE,
                "table": TABLE,
                "exists": True,
                "targets": list(TARGETS),
                "columns": columns,
                "textColumnsSearched": searched,
                "locationLikeColumns": [
                    str(row["COLUMN_NAME"])
                    for row in columns
                    if any(token in str(row["COLUMN_NAME"]).casefold()
                           for token in ("ubic", "calle", "casa", "inver", "loca", "calle"))
                ],
                "matches": matches,
                "readOnly": True,
            }
            if not matches:
                result["message"] = (
                    "No se encontraron las partidas en las columnas candidatas. "
                    "El esquema queda listado para decidir la clave correcta."
                )
            print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
            return 0
        finally:
            cursor.close()
    finally:
        if connection.is_connected():
            connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
