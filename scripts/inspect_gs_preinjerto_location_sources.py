#!/usr/bin/env python3
"""Read-only GS discovery for Preinjerto greenhouse/street source.

Searches information_schema for location-related tables/columns and then
queries only the two approved partida IDs in plausible indexed/text-key columns
of candidate tables. It never writes to GS or Firebase or dumps whole tables.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from typing import Any

try:
    import mysql.connector
except ImportError:
    print("Falta mysql-connector-python. Instálalo en el entorno .venv.", file=sys.stderr)
    raise SystemExit(2)

from pilot_gs_qc_preinjerto import MYSQL_DATABASE, MYSQL_HOST, MYSQL_PORT, get_mysql_credentials

TARGETS = ("26C02436", "26C02653")
LOCATION_TOKENS = ("ubic", "calle", "loca", "inver", "nave", "sector", "pasillo")
TABLE_TOKENS = LOCATION_TOKENS + ("extension", "exten", "partidas_par", "p-carga_pca_par")
KEY_TOKENS = ("part", "par", "npa", "pex_npa", "pin_npa")


def has_token(value: Any, tokens: tuple[str, ...]) -> bool:
    value = str(value).casefold()
    return any(token in value for token in tokens)


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
                SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_TYPE,
                       c.IS_NULLABLE, c.COLUMN_KEY, c.COLUMN_COMMENT,
                       COALESCE(t.TABLE_ROWS, 0) AS ESTIMATED_ROWS
                FROM information_schema.COLUMNS c
                LEFT JOIN information_schema.TABLES t
                  ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
                WHERE c.TABLE_SCHEMA = %s
                ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
                """,
                (MYSQL_DATABASE,),
            )
            all_columns = cursor.fetchall()
            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for row in all_columns:
                grouped[str(row["TABLE_NAME"])].append(row)

            candidate_names = []
            for table_name, cols in grouped.items():
                if (
                    has_token(table_name, TABLE_TOKENS)
                    or table_name.casefold() == "partidas"
                    or any(has_token(c["COLUMN_NAME"], LOCATION_TOKENS) for c in cols)
                ):
                    candidate_names.append(table_name)

            # Keep dynamic discovery bounded if the schema has many auxiliary tables.
            candidate_names = sorted(candidate_names)[:80]
            schema_candidates = {
                table_name: [
                    {
                        "column": row["COLUMN_NAME"],
                        "type": row["COLUMN_TYPE"],
                        "key": row["COLUMN_KEY"],
                        "comment": row["COLUMN_COMMENT"],
                        "estimatedTableRows": row["ESTIMATED_ROWS"],
                    }
                    for row in grouped[table_name]
                ]
                for table_name in candidate_names
            }

            cursor.execute(
                """
                SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME,
                       REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = %s
                  AND (TABLE_NAME = 'partidas' OR REFERENCED_TABLE_NAME = 'partidas')
                ORDER BY TABLE_NAME, COLUMN_NAME
                """,
                (MYSQL_DATABASE,),
            )
            partida_relations = cursor.fetchall()

            matches: list[dict[str, Any]] = []
            searches: list[dict[str, str]] = []
            for table_name in candidate_names:
                cols = grouped[table_name]
                estimated_rows = max(
                    [int(row["ESTIMATED_ROWS"] or 0) for row in cols] or [0]
                )
                for row in cols:
                    col_name = str(row["COLUMN_NAME"])
                    data_type = str(row["DATA_TYPE"]).casefold()
                    if data_type not in {"char", "varchar", "tinytext", "text",
                                         "mediumtext", "longtext", "enum", "set"}:
                        continue
                    name_is_candidate = (
                        str(row["COLUMN_KEY"]) in {"PRI", "UNI"}
                        or col_name.casefold() == "id"
                        or has_token(col_name, KEY_TOKENS)
                    )
                    # Generic C0 fields are searched only in named location tables
                    # and when the table is small or the column is indexed.
                    generic_location_field = (
                        col_name.casefold() == "c0"
                        and has_token(table_name, TABLE_TOKENS)
                        and (estimated_rows <= 500_000 or str(row["COLUMN_KEY"]) in {"PRI", "UNI"})
                    )
                    if not (name_is_candidate or generic_location_field):
                        continue
                    escaped_table = table_name.replace("`", "``")
                    escaped_column = col_name.replace("`", "``")
                    query = (
                        f"SELECT * FROM `{MYSQL_DATABASE}`.`{escaped_table}` "
                        f"WHERE `{escaped_column}` IN (%s, %s) LIMIT 20"
                    )
                    try:
                        cursor.execute(query, TARGETS)
                        rows = cursor.fetchall()
                    except mysql.connector.Error as exc:
                        searches.append({
                            "table": table_name,
                            "column": col_name,
                            "result": f"query error: {exc}",
                        })
                        continue
                    searches.append({
                        "table": table_name,
                        "column": col_name,
                        "result": f"{len(rows)} exact match(es)",
                    })
                    matches.extend(
                        {"table": table_name, "matchedBy": col_name, "row": found}
                        for found in rows
                    )

            # Compare the two parts against the proven location feeds used by
            # the other QC modules: Carga uses p-carga_pca_par.C3/C4/C5;
            # Túnel uses p-injertos.PIN_LOCA. These are exact-ID lookups only.
            other_qc_sources: dict[str, Any] = {}
            cursor.execute(
                """
                SELECT d.id AS id_carga, d.id2, TRIM(d.C0) AS partida,
                       d.C3 AS id_invernadero, inv.INV_DENO AS invernadero,
                       d.C4 AS calle_desde, d.C5 AS calle_hasta,
                       p.PCA_FEC AS fecha_carga, p.PCA_HORA AS hora
                FROM `p-carga_pca_par` AS d
                LEFT JOIN `p-carga` AS p ON p.id = d.id
                LEFT JOIN `invernaderos` AS inv ON inv.id = d.C3
                WHERE TRIM(d.C0) IN (%s, %s)
                ORDER BY p.PCA_FEC, p.PCA_HORA, d.id, d.id2
                LIMIT 100
                """,
                TARGETS,
            )
            other_qc_sources["qc_carga"] = cursor.fetchall()

            cursor.execute(
                """
                SELECT id, PIN_PAR AS partida, PIN_FECP AS fecha_qc,
                       PIN_LOCA AS calle, PIN_NBAN AS bandejas, PIN_EST AS estado
                FROM `p-injertos`
                WHERE TRIM(PIN_PAR) IN (%s, %s)
                ORDER BY PIN_FECP, id
                LIMIT 100
                """,
                TARGETS,
            )
            other_qc_sources["qc_tunel"] = cursor.fetchall()

            result = {
                "database": MYSQL_DATABASE,
                "targets": list(TARGETS),
                "schemaCandidates": schema_candidates,
                "otherQcLocationSources": other_qc_sources,
                "foreignKeyRelationsWithPartidas": partida_relations,
                "targetSearches": searches,
                "targetMatches": matches,
                "readOnly": True,
                "note": (
                    "Schema discovery is limited to location-related names. "
                    "Data queries use exact IDs and return at most 20 rows per column."
                ),
            }
            print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
            return 0
        finally:
            cursor.close()
    finally:
        if connection.is_connected():
            connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
