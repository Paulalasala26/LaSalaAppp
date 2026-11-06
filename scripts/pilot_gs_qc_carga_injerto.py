#!/usr/bin/env python3
"""Carga líneas injertadas de GS en el entorno Firebase TEST para QC Carga Injerto.

Solo ejecuta SELECT en MySQL. En TEST reemplaza las filas del rango solicitado
en el shard dedicado y guarda la instantánea de origen por fecha.
"""
from __future__ import annotations

import argparse
import getpass
import json
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

try:
    import mysql.connector
except ImportError:
    print("Falta mysql-connector-python. Instala mysql-connector-python.", file=sys.stderr)
    raise SystemExit(2)

try:
    import firebase_admin
    from firebase_admin import credentials, db
except ImportError:
    firebase_admin = None
    credentials = None
    db = None

MYSQL_HOST = "192.168.1.101"
MYSQL_PORT = 3306
MYSQL_DATABASE = "sala12"
MYSQL_DEFAULT_USER = "global"
FIREBASE_TEST_PROJECT_ID = "la-sala-app-test"
FIREBASE_TEST_DATABASE_URL = (
    "https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app"
)
FEED_ROOT = "lasala-gs-carga-injerto-v1/by-date"
SHARD_PREFIX = "lasala-control-items-v2-carga_injerto-q"
INDEX_PATH = "lasala-control-items-v2-index"
DB_ANCHOR = date(2026, 6, 15)

SQL_INJERTO = """
SELECT
    CONCAT(p.id, '-', d.id2) AS id_linea_carga,
    p.id AS id_carga,
    p.PCA_FEC AS fecha,
    p.PCA_HORA AS hora,
    p.PCA_CCL AS codigo_cliente_carga,
    c.CL_DENO AS cliente_carga,
    d.C0 AS partida,
    part.PAR_NMSM AS variedad,
    part.PAR_TSI AS codigo_siembra,
    tsi.TSI_DENO AS denominacion_siembra,
    d.C8 AS bandejas,
    d.C9 AS plantas,
    d.C3 AS id_invernadero,
    inv.INV_DENO AS invernadero,
    d.C4 AS ubicacion_2,
    d.C5 AS ubicacion_3,
    d.C13 AS carros_y_notas
FROM `p-carga` AS p
INNER JOIN `p-carga_pca_par` AS d
    ON d.id = p.id
LEFT JOIN `clientes` AS c
    ON c.id = p.PCA_CCL
LEFT JOIN `partidas` AS part
    ON part.id = d.C0
LEFT JOIN `t-siembras` AS tsi
    ON tsi.id = part.PAR_TSI
LEFT JOIN `invernaderos` AS inv
    ON inv.id = d.C3
WHERE p.PCA_FEC BETWEEN %s AND %s
  AND EXISTS (
      SELECT 1
      FROM `p-injertos` AS inj
      WHERE TRIM(inj.PIN_PAR) = TRIM(d.C0)
  )
ORDER BY p.PCA_FEC, p.PCA_HORA, p.id, d.id2
"""


def json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def read_mysql_rows(start: date, end: date) -> list[dict[str, Any]]:
    user = input(f"Usuario MySQL [{MYSQL_DEFAULT_USER}]: ").strip() or MYSQL_DEFAULT_USER
    password = getpass.getpass("Contraseña MySQL: ")
    connection = None
    try:
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
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute(SQL_INJERTO, (start, end))
            return cursor.fetchall()
        finally:
            cursor.close()
    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def day_index(fecha: date) -> int:
    value = 15 + (fecha - DB_ANCHOR).days
    if value < 15 or value > 4000:
        raise ValueError(f"Fecha fuera del calendario QC: {fecha.isoformat()}")
    return value


def build_payloads(rows: list[dict[str, Any]], start: date, end: date):
    by_date: dict[str, dict[str, dict[str, Any]]] = {}
    controls_by_shard: dict[str, dict[str, dict[str, Any]]] = {}

    for source in rows:
        item = {key: json_value(value) for key, value in source.items()}
        fecha = str(item["fecha"])
        fecha_obj = date.fromisoformat(fecha)
        if not start <= fecha_obj <= end:
            raise ValueError(f"GS devolvió una fecha fuera del rango: {fecha}")
        gs_id = str(item["id_linea_carga"])
        if not gs_id or "/" in gs_id:
            raise ValueError(f"ID de línea GS no válido: {gs_id!r}")
        if gs_id in by_date.setdefault(fecha, {}):
            raise ValueError(f"Clave de línea duplicada en GS: {gs_id}")

        item["id_linea_carga"] = gs_id
        item["id_carga"] = str(item["id_carga"])
        item["partida"] = str(item["partida"]).strip()
        if not item["partida"]:
            raise ValueError(f"Línea GS sin partida: {gs_id}")
        by_date[fecha][gs_id] = item

        day = day_index(fecha_obj)
        q = (day - 15) // 14
        shard = f"{SHARD_PREFIX}{q}"
        record_id = f"inj_{gs_id}"
        control = {
            "id": record_id,
            "tipo": "carga_injerto",
            "dia": day,
            "partida": item["partida"],
            "cliente": str(item.get("cliente_carga") or ""),
            "clienteVariedad": str(item.get("cliente_carga") or ""),
            "variedad": str(item.get("variedad") or ""),
            "numBandejas": item.get("bandejas"),
            "invId": str(item.get("id_invernadero") or ""),
            "calleDesde": item.get("ubicacion_2"),
            "calleHasta": item.get("ubicacion_3"),
            "hora": str(item.get("hora") or ""),
            "origenGS": "qc_carga_injerto",
            "idLineaGS": gs_id,
        }
        controls_by_shard.setdefault(shard, {})[record_id] = control

    return by_date, controls_by_shard


def sync_test(by_date, controls_by_shard, start: date, end: date, credentials_path: Path):
    if firebase_admin is None or credentials is None or db is None:
        raise RuntimeError("Falta firebase-admin. Instálalo antes de sincronizar.")
    if not credentials_path.is_file():
        raise FileNotFoundError(f"No existe la credencial: {credentials_path}")
    with credentials_path.open("r", encoding="utf-8") as stream:
        service_account = json.load(stream)
    if service_account.get("project_id") != FIREBASE_TEST_PROJECT_ID:
        raise ValueError(
            f"La credencial no pertenece a Firebase TEST ({FIREBASE_TEST_PROJECT_ID})."
        )

    app = firebase_admin.initialize_app(
        credentials.Certificate(str(credentials_path)),
        {"databaseURL": FIREBASE_TEST_DATABASE_URL},
        name="gs-carga-injerto-test",
    )
    try:
        all_shards = set(controls_by_shard)
        # Asegura que también se retire una línea antigua si el rango ahora queda vacío.
        for offset in range((end - start).days + 1):
            fecha = start.fromordinal(start.toordinal() + offset)
            q = (day_index(fecha) - 15) // 14
            all_shards.add(f"{SHARD_PREFIX}{q}")

        for shard in sorted(all_shards):
            day_for_shard = {
                day_index(start.fromordinal(start.toordinal() + offset))
                for offset in range((end - start).days + 1)
                if f"{SHARD_PREFIX}{(day_index(start.fromordinal(start.toordinal() + offset))-15)//14}" == shard
            }
            incoming = controls_by_shard.get(shard, {})
            ref = db.reference(shard, app=app)

            def replace_range(current):
                current = current or {}
                retained = {
                    key: value for key, value in current.items()
                    if not (isinstance(value, dict) and value.get("tipo") == "carga_injerto"
                            and value.get("dia") in day_for_shard)
                }
                retained.update(incoming)
                return retained or None

            ref.transaction(replace_range)
            count = len(db.reference(shard, app=app).get() or {})
            q_text = shard.rsplit("q", 1)[1]
            db.reference(f"{INDEX_PATH}/shards/carga_injerto|{q_text}", app=app).set({
                "key": shard, "tipo": "carga_injerto", "q": int(q_text), "count": count
            })

        for offset in range((end - start).days + 1):
            fecha = start.fromordinal(start.toordinal() + offset)
            iso = fecha.isoformat()
            lines = by_date.get(iso, {})
            payload = {
                "metadata": {
                    "schemaVersion": 1,
                    "source": "GS MySQL sala12",
                    "module": "qc_carga_injerto",
                    "fecha": iso,
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                    "lineCount": len(lines),
                    "loadCount": len({str(x.get("id_carga")) for x in lines.values()}),
                    "readOnlySource": True,
                },
                "lineas": lines,
            }
            db.reference(f"{FEED_ROOT}/{iso}", app=app).set(payload)
    finally:
        firebase_admin.delete_app(app)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Lee solo cargas vinculadas a injerto y las sincroniza en Firebase TEST."
    )
    parser.add_argument("--desde", required=True, help="Fecha inicial AAAA-MM-DD, inclusive.")
    parser.add_argument("--hasta", required=True, help="Fecha final AAAA-MM-DD, inclusive.")
    parser.add_argument("--sync-test", action="store_true", help="Escribe los datos en Firebase TEST.")
    parser.add_argument("--firebase-credentials", help="Ruta al JSON de credenciales Firebase TEST.")
    args = parser.parse_args()
    try:
        args.desde = date.fromisoformat(args.desde)
        args.hasta = date.fromisoformat(args.hasta)
    except ValueError:
        parser.error("Las fechas deben tener formato AAAA-MM-DD.")
    if args.hasta < args.desde:
        parser.error("--hasta debe ser igual o posterior a --desde.")
    if (args.hasta - args.desde).days > 90:
        parser.error("El rango máximo es de 91 días.")
    if args.firebase_credentials and not args.sync_test:
        parser.error("Usa --firebase-credentials junto con --sync-test.")
    return args


def main() -> int:
    args = parse_args()
    try:
        rows = read_mysql_rows(args.desde, args.hasta)
        by_date, controls = build_payloads(rows, args.desde, args.hasta)
        line_count = sum(len(items) for items in by_date.values())
        trays = sum(int(json_value(row.get("bandejas")) or 0) for row in rows)
        print(f"Filas injertadas leídas de GS: {line_count}")
        print(f"Bandejas: {trays:,}".replace(",", "."))
        print(f"Rango: {args.desde.isoformat()} a {args.hasta.isoformat()}")
        if args.sync_test:
            credential_arg = args.firebase_credentials or input(
                "Ruta del JSON de credenciales Firebase TEST: "
            ).strip()
            if not credential_arg:
                raise ValueError("No se indicó la ruta de credenciales Firebase TEST.")
            sync_test(by_date, controls, args.desde, args.hasta, Path(credential_arg).expanduser())
            print("Sincronización TEST completada: snapshot GS + filas QC Carga Injerto.")
        else:
            print("Modo lectura: no se ha escrito en Firebase. Añade --sync-test para sincronizar.")
        return 0
    except KeyboardInterrupt:
        print("Operación cancelada.", file=sys.stderr)
        return 130
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
