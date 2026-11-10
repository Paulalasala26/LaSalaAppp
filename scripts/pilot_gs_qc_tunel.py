import argparse
import getpass
import json
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import mysql.connector


MYSQL_HOST = "192.168.1.101"
MYSQL_PORT = 3306
MYSQL_DATABASE = "sala12"

FIREBASE_PROJECT_ID = "la-sala-app-test"
FIREBASE_DATABASE_URL = (
    "https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app"
)
FIREBASE_NODE = "lasala-gs-partes-v1/by-date"

SQL_PARTES = """
SELECT
    pi.id AS gs_injerto_id,
    pi.PIN_PAR AS gs_partida,
    pa.PAR_CCL AS codigo_cliente,
    pa.PAR_NMCL AS cliente,
    pa.PAR_NMSM AS nombre_semilla,
    pa.PAR_TSI AS id_tipo_siembra,
    ts.TSI_DENO AS tipo_siembra,
    pi.PIN_NPLA AS plantas,
    pi.PIN_NBAN AS bandejas,
    pi.PIN_FECE AS fecha_entrada,
    pi.PIN_FECP AS fecha_prevista,
    pi.PIN_FECS AS fecha_salida_real,
    pa.PAR_CAS AS PAR_CAS,
    pi.PIN_LOCA AS PIN_LOCA,
    pi.PIN_EST AS estado_gs,
    pi.PIN_OBS AS codigo_observacion,
    pi.PIN_OBSP AS observaciones
FROM `p-injertos` pi
LEFT JOIN partidas pa
    ON pa.id = pi.PIN_PAR
LEFT JOIN `t-siembras` ts
    ON ts.id = pa.PAR_TSI
WHERE pi.PIN_FECP = %s
ORDER BY pi.PIN_FECP, pi.id
"""


def json_seguro(valor):
    """Convierte recursivamente tipos MySQL a tipos compatibles con JSON/Firebase."""
    if isinstance(valor, dict):
        return {str(clave): json_seguro(item) for clave, item in valor.items()}

    if isinstance(valor, (list, tuple)):
        return [json_seguro(item) for item in valor]

    if isinstance(valor, (date, datetime)):
        return valor.isoformat()

    if isinstance(valor, Decimal):
        if valor == valor.to_integral_value():
            return int(valor)
        return float(valor)

    return valor


def crear_payload(filas, fecha):
    partes = {}

    for fila in filas:
        parte = dict(fila)
        source_id = str(parte["gs_injerto_id"]).strip()

        if not source_id:
            raise ValueError("Hay una fila GS sin ID.")

        if source_id in partes:
            raise ValueError(f"ID GS duplicado en el resultado: {source_id}")

        # Ubicaciones literales: PAR_CAS es el código bruto de invernadero y
        # PIN_LOCA es la calle del registro de p-injertos de PIN_FECP.
        # No deducir ubicaciones de observaciones ni tratar PIN_LOCA como
        # identificador de invernadero para consultar su catálogo.
        parte["gs_injerto_id"] = source_id

        partes[source_id] = parte

    payload = {
        "metadata": {
            "origen": "GS",
            "tabla_origen": "p-injertos",
            "fecha_prevista": fecha,
            "generado_utc": datetime.now(timezone.utc).isoformat(),
            "numero_partes": len(partes),
        },
        "partes": partes,
    }

    return json_seguro(payload)


def sincronizar_firebase_test(payload, archivo_credencial, fecha):
    cred_path = Path(archivo_credencial)

    if not cred_path.is_file():
        raise FileNotFoundError(
            f"No encuentro la credencial de Firebase: {cred_path}"
        )

    datos_credencial = json.loads(cred_path.read_text(encoding="utf-8"))

    if datos_credencial.get("project_id") != FIREBASE_PROJECT_ID:
        raise ValueError(
            "La credencial no pertenece al proyecto TEST "
            f"{FIREBASE_PROJECT_ID}; no se ha escrito nada."
        )

    import firebase_admin
    from firebase_admin import credentials, db

    nombre_app = "gs-qc-tunel-test"

    try:
        app = firebase_admin.get_app(nombre_app)
    except ValueError:
        credencial = credentials.Certificate(str(cred_path))
        app = firebase_admin.initialize_app(
            credencial,
            {"databaseURL": FIREBASE_DATABASE_URL},
            name=nombre_app,
        )

    ruta = f"{FIREBASE_NODE}/{fecha}"
    db.reference(ruta, app=app).set(json_seguro(payload))
    return ruta


def main():
    parser = argparse.ArgumentParser(
        description="Lee partes de GS y genera un archivo JSON."
    )
    parser.add_argument(
        "--fecha",
        help="Fecha prevista en formato AAAA-MM-DD.",
    )
    parser.add_argument(
        "--sync-test",
        action="store_true",
        help="Escribe la vista de esa fecha en la RTDB de TEST.",
    )
    parser.add_argument(
        "--firebase-key",
        default="firebase-service-account-test.json",
        help="Ruta local a la clave de servicio del proyecto TEST.",
    )
    args = parser.parse_args()

    fecha = args.fecha or input("Fecha prevista (AAAA-MM-DD): ").strip()

    try:
        fecha = date.fromisoformat(fecha).isoformat()
    except ValueError:
        print("Fecha no válida. Usa AAAA-MM-DD, por ejemplo 2026-01-12.")
        return 2

    usuario = input("Usuario MySQL [global]: ").strip() or "global"
    contrasena = getpass.getpass("Contraseña MySQL: ")
    conexion = None

    try:
        conexion = mysql.connector.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=usuario,
            password=contrasena,
            database=MYSQL_DATABASE,
            connection_timeout=10,
        )

        conexion.start_transaction(readonly=True)
        cursor = conexion.cursor(dictionary=True)

        cursor.execute(SQL_PARTES, (fecha,))
        filas = cursor.fetchall()

        if not filas:
            cursor.close()
            print(f"No hay partes con PIN_FECP = {fecha}. No se sincroniza.")
            return 0

        cursor.close()

        payload = crear_payload(filas, fecha)

        salida = Path(f"pilot_gs_qc_tunel_{fecha}.json")
        salida.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print(f"Lectura correcta: {len(filas)} partes.")
        print(f"JSON local: {salida.resolve()}")

        if args.sync_test:
            ruta = sincronizar_firebase_test(
                payload,
                args.firebase_key,
                fecha,
            )
            print(f"Sincronización TEST correcta: {ruta}")
        else:
            print("Modo de prueba: no se escribió en Firebase.")

        return 0

    except Exception as error:
        print(f"Error: {error}")
        return 1

    finally:
        if conexion is not None and conexion.is_connected():
            conexion.close()


if __name__ == "__main__":
    sys.exit(main())