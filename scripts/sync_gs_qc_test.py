#!/usr/bin/env python
"""Sincronización automática y acotada de Preinjerto y Carga Injerto a Firebase TEST.

La consulta GS es de solo lectura. Los datos se guardan en los feeds de TEST y
las líneas QC se incorporan a los shards existentes sin borrar inspecciones.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date, timedelta, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--firebase-credentials", required=True,
                        help="Ruta local del JSON de cuenta de servicio de Firebase TEST.")
    parser.add_argument("--hoy", type=date.fromisoformat, default=date.today(),
                        help="Fecha de referencia AAAA-MM-DD; por defecto, hoy.")
    args = parser.parse_args()

    credential_path = Path(args.firebase_credentials).expanduser().resolve()
    if not credential_path.is_file():
        parser.error(f"No existe el JSON de credenciales Firebase: {credential_path}")

    end = args.hoy + timedelta(days=5)
    log_path = LOG_DIR / f"gs_qc_test_{args.hoy:%Y%m%d}.log"
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    jobs = [
        ("QC Preinjerto", [
            sys.executable, str(ROOT / "pilot_gs_qc_preinjerto.py"),
            "--desde", args.hoy.isoformat(), "--hasta", end.isoformat(),
            "--sync-test", "--sync-qc-items",
            "--firebase-credentials", str(credential_path),
        ]),
        ("QC Carga Injerto", [
            sys.executable, str(ROOT / "pilot_gs_qc_carga_injerto.py"),
            "--desde", args.hoy.isoformat(), "--hasta", end.isoformat(),
            "--sync-test", "--firebase-credentials", str(credential_path),
        ]),
    ]

    started = datetime.now().astimezone().isoformat(timespec="seconds")
    header = f"\n=== Inicio {started}; rango GS {args.hoy} a {end} ===\n"
    print(header, end="")
    with log_path.open("a", encoding="utf-8") as log:
        log.write(header)
        for label, command in jobs:
            marker = f"--- {label} ---\n"
            print(marker, end="")
            log.write(marker)
            try:
                result = subprocess.run(
                    command, cwd=ROOT, stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace", timeout=900,
                    check=False,
                )
            except (OSError, subprocess.TimeoutExpired) as exc:
                message = f"ERROR {label}: {exc}\n"
                print(message, end="", file=sys.stderr)
                log.write(message)
                return 1
            output = result.stdout or ""
            print(output, end="")
            log.write(output)
            if result.returncode:
                message = f"ERROR {label}: terminó con código {result.returncode}.\n"
                print(message, end="", file=sys.stderr)
                log.write(message)
                return result.returncode
        finished = datetime.now().astimezone().isoformat(timespec="seconds")
        footer = f"=== Fin correcto {finished}; Firebase TEST actualizado ===\n"
        print(footer, end="")
        log.write(footer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
