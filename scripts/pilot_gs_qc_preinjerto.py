#!/usr/bin/env python3
"""Extrae de GS la planificación de QC Preinjerto (Patrón y Variedad).

Solo ejecuta SELECT en GS y guarda una instantánea JSON local. La escritura
en Firebase se deja fuera hasta que la app tenga definida la ruta/contrato
de lectura de estos datos.
"""
from __future__ import annotations

import argparse
import getpass
import json
import re
import sys
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

try:
    import mysql.connector
except ImportError:
    print("Falta mysql-connector-python. Instálalo en el entorno .venv.", file=sys.stderr)
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
KEYRING_SERVICE = "ViguerappGS"
FIREBASE_TEST_PROJECT_ID = "la-sala-app-test"
FIREBASE_TEST_DATABASE_URL = (
    "https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app"
)
FIREBASE_TEST_ROOT = "lasala-gs-preinjerto-v1/by-range"
ROOT = Path(__file__).resolve().parent
SNAPSHOT_DIR = ROOT / "snapshots"

SQL_PREINJERTO = """
SELECT
    p.PAR_CCL AS `Cod Cliente`,
    p.id AS `PARTIDA`,
    p.PAR_NMSM AS `VARIEDAD`,
    p.PAR_FECS AS `F Siembra`,
    p.PAR_FECE AS `F Entrega`,
    p.PAR_TISOL AS `TS`,
    NULLIF(p.PAR_ALVS, 0) AS `Pl sol`,
    NULLIF(p.PAR_PLS, 0) AS `Sem`,
    NULLIF(p.PAR_BASI, 0) AS `Band`,
    p.PAR_ENCL AS `S?`,
    NULL AS `Band Act`,
    NULL AS `Sem act`,
    p.PAR_OBSI AS `OBSERVA`,
    p.PAR_BIOL AS `Partida biológica?`,
    p.PAR_TISOL AS `Tipo de Solicitud`,
    p.PAR_SSI AS `Soporte de Siembra`,
    p.PAR_LOTE AS `Nº Lote`,
    COALESCE(c.CL_DENO, p.PAR_NMCL) AS `Nombre Cliente`,
    NULL AS `Germ`,
    p.PAR_CLF AS `Cliente Final`,
    NULLIF(p.PAR_SMS, 0) AS `Semana Siembra`,
    p.PAR_TSI AS `Tipo de Siembra`,
    e.ENG_FEC AS `Fecha encargo`,
    NULL AS `Fecha Real Siembra`,
    p.PAR_CAS AS `PAR_CAS`,
    p.PAR_UBIC AS `PAR_UBIC`,
    CASE
        WHEN p.id LIKE '__P%' OR p.id LIKE '__WE%' THEN 'patron'
        ELSE 'variedad'
    END AS `QC Preinjerto`
FROM sala12.partidas AS p
LEFT JOIN sala12.encargos AS e ON e.id = p.PAR_ENC
LEFT JOIN sala12.clientes AS c ON c.id = p.PAR_CCL
WHERE (p.id LIKE '__P%' OR p.id LIKE '__WE%'
       OR p.id LIKE '__C%' OR p.id LIKE '__VE%')
  AND p.PAR_FECS >= %s
  AND p.PAR_FECS < DATE_ADD(%s, INTERVAL 1 DAY)
ORDER BY p.PAR_FECS, p.id
"""


def json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def get_mysql_credentials() -> tuple[str, str]:
    """Prefiere credenciales de Windows; si faltan, solicita acceso en consola."""
    user = MYSQL_DEFAULT_USER
    password = None
    try:
        import keyring
        from keyring.backends.Windows import WinVaultKeyring
    except ImportError:
        # En el conector local no es obligatorio instalar keyring.
        pass
    else:
        keyring.set_keyring(WinVaultKeyring())
        user = keyring.get_password(KEYRING_SERVICE, "mysql-user") or user
        password = keyring.get_password(KEYRING_SERVICE, "mysql-password")
    if not password:
        if not sys.stdin.isatty():
            raise RuntimeError(
                "Faltan credenciales GS para la tarea programada. "
                "Guárdalas en Windows Credential Manager con el servicio "
                f"{KEYRING_SERVICE} y las claves mysql-user/mysql-password."
            )
        user = input(f"Usuario MySQL [{user}]: ").strip() or user
        password = getpass.getpass("Contraseña MySQL: ")
    if not password:
        raise RuntimeError("No se ha indicado la contraseña MySQL.")
    return user, password


def read_rows(desde: date, hasta: date) -> list[dict[str, Any]]:
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
            cursor.execute(SQL_PREINJERTO, (desde, hasta))
            return cursor.fetchall()
        finally:
            cursor.close()
    finally:
        if connection.is_connected():
            connection.close()


def write_snapshot(rows: list[dict[str, Any]], desde: date, hasta: date) -> Path:
    # Detecta versiones antiguas del SELECT: un campo ausente no equivale a
    # un campo presente pero vacío en GS.
    required = {"PAR_CAS", "PAR_UBIC", "Cliente Final"}
    if rows:
        missing = sorted(required.difference(rows[0]))
        if missing:
            raise ValueError(
                "El SELECT de Preinjerto no devuelve las columnas de ubicación: "
                + ", ".join(missing) + ". Actualiza el conector desde test/v1.0."
            )
    records: dict[str, dict[str, Any]] = {}
    counts = {"patron": 0, "variedad": 0}
    coverage = {"parCas": 0, "parUbic": 0, "clienteFinalInv": 0}
    for source in rows:
        row = {key: json_value(value) for key, value in source.items()}
        part = str(row.get("PARTIDA") or "").strip()
        category = str(row.get("QC Preinjerto") or "").strip()
        if not part or category not in counts:
            continue
        if part in records:
            raise ValueError(f"Partida duplicada devuelta por GS: {part}")
        records[part] = row
        counts[category] += 1
        if str(row.get("PAR_CAS") or "").strip() not in ("", "0"):
            coverage["parCas"] += 1
        if str(row.get("PAR_UBIC") or "").strip() not in ("", "0"):
            coverage["parUbic"] += 1
        final = str(row.get("Cliente Final") or "").strip()
        if re.fullmatch(r"INVERNADERO\s+[A-Za-z0-9_-]+", final, re.IGNORECASE):
            coverage["clienteFinalInv"] += 1

    payload = {
        "metadata": {
            "schemaVersion": 1,
            "source": "GS MySQL sala12",
            "module": "qc_preinjerto",
            "desde": desde.isoformat(),
            "hasta": hasta.isoformat(),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "total": len(records),
            "patron": counts["patron"],
            "variedad": counts["variedad"],
            "ubicaciones": coverage,
            "readOnlySource": True,
        },
        "partidas": records,
    }
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    output = SNAPSHOT_DIR / f"gs_qc_preinjerto_{desde.isoformat()}_{hasta.isoformat()}.json"
    with output.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
    return output


def sync_firebase_test(payload: dict[str, Any], desde: date, hasta: date,
                       credential_path: Path) -> str:
    if firebase_admin is None or credentials is None or db is None:
        raise RuntimeError("Falta firebase-admin. Instálalo en el entorno .venv.")
    if not credential_path.is_file():
        raise FileNotFoundError(f"No existe el JSON de credenciales: {credential_path}")
    with credential_path.open("r", encoding="utf-8") as stream:
        service_account = json.load(stream)
    if service_account.get("project_id") != FIREBASE_TEST_PROJECT_ID:
        raise ValueError(
            "La clave no pertenece al proyecto Firebase TEST esperado "
            f"({FIREBASE_TEST_PROJECT_ID}). No se ha sincronizado nada."
        )

    app = firebase_admin.initialize_app(
        credentials.Certificate(str(credential_path)),
        {"databaseURL": FIREBASE_TEST_DATABASE_URL},
        name="gs-preinjerto-test",
    )
    relative_path = f"{FIREBASE_TEST_ROOT}/{desde.isoformat()}_{hasta.isoformat()}"
    try:
        db.reference(relative_path, app=app).set(payload)
    finally:
        firebase_admin.delete_app(app)
    return relative_path


def main() -> int:
    today = date.today()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desde", type=date.fromisoformat, default=today,
                        help="Fecha inicial F Siembra, AAAA-MM-DD (por defecto: hoy).")
    parser.add_argument("--hasta", type=date.fromisoformat, default=today + timedelta(days=5),
                        help="Fecha final inclusiva F Siembra (por defecto: hoy + 5 días).")
    parser.add_argument("--sync-test", action="store_true",
                        help="Guarda la instantánea en Firebase TEST tras generarla.")
    parser.add_argument("--sync-qc-items", action="store_true",
                        help="Importa también las partidas en los shards QC que consume la app.")
    parser.add_argument("--firebase-credentials",
                        help="Ruta al JSON de cuenta de servicio de Firebase TEST.")
    args = parser.parse_args()
    if args.hasta < args.desde:
        parser.error("--hasta no puede ser anterior a --desde.")
    if args.firebase_credentials and not args.sync_test:
        parser.error("Usa --firebase-credentials junto con --sync-test.")
    if args.sync_qc_items and not args.sync_test:
        parser.error("Usa --sync-qc-items junto con --sync-test.")

    rows = read_rows(args.desde, args.hasta)
    output = write_snapshot(rows, args.desde, args.hasta)
    payload = json.loads(output.read_text(encoding="utf-8"))
    metadata = payload["metadata"]
    print(
        "QC Preinjerto: "
        f"total={metadata['total']} patron={metadata['patron']} "
        f"variedad={metadata['variedad']} desde={args.desde} hasta={args.hasta}"
    )
    print(
        "Ubicaciones GS: "
        f"PAR_CAS={metadata['ubicaciones']['parCas']} "
        f"PAR_UBIC={metadata['ubicaciones']['parUbic']} "
        f"Cliente_Final_INV={metadata['ubicaciones']['clienteFinalInv']}"
    )
    if metadata["total"] and not metadata["ubicaciones"]["parCas"]:
        print("AVISO: ninguna partida trae PAR_CAS; verificar la fuente antes de sincronizar.")
    print(f"Instantánea: {output}")
    if args.sync_test:
        if not args.firebase_credentials:
            parser.error("Indica --firebase-credentials para sincronizar a TEST.")
        firebase_path = sync_firebase_test(
            payload, args.desde, args.hasta,
            Path(args.firebase_credentials).expanduser().resolve(),
        )
        print(f"Sincronización TEST correcta: {firebase_path}")
        if args.sync_qc_items:
            from gs_qc_import import sync_preinjerto_from_connector
            counts = sync_preinjerto_from_connector(
                output, Path(args.firebase_credentials).expanduser().resolve(), args.desde
            )
            for module, (created, updated) in counts.items():
                print(f"Importación QC {module}: nuevas={created} actualizadas={updated}")
    else:
        print("Modo local: no se ha escrito en Firebase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
