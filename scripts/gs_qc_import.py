#!/usr/bin/env python3
"""Incorpora snapshots GS en las listas operativas de QC (solo Firebase TEST)."""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

PROJECT_ID = "la-sala-app-test"
DATABASE_URL = "https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app"
ITEMS_ROOT = "lasala-control-items-v1"
V2_INDEX = "lasala-control-items-v2-index"
V2_PREFIX = "lasala-control-items-v2-"
IMPORT_INDEX = "lasala-gs-qc-import-index-v1"
ANCHOR_DATE = date(2026, 6, 15)
ANCHOR_DAY = 15


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _number(value: Any) -> str:
    text = _text(value)
    if re.fullmatch(r"-?\d+\.0+", text):
        return text.split(".", 1)[0]
    return text


def _date_iso(value: Any) -> str:
    text = _text(value)
    if not text:
        raise ValueError("La fila GS no tiene fecha operativa.")
    return date.fromisoformat(text[:10]).isoformat()


def _day_number(day_iso: str) -> int:
    return ANCHOR_DAY + (date.fromisoformat(day_iso) - ANCHOR_DATE).days


def _shard(day_number: int, module: str) -> str:
    q = max(0, (day_number - 15) // 14)
    return f"{V2_PREFIX}{module}-q{q}"


def _safe_id(prefix: str, source_id: str) -> str:
    digest = hashlib.sha256(source_id.encode("utf-8")).hexdigest()[:32]
    return f"gs_{prefix}_{digest}"


def _find_tunnel_records(payload: Any) -> list[dict[str, Any]]:
    """Acepta el array original y snapshots envueltos en metadata/partes/data."""
    if isinstance(payload, list):
        direct = [row for row in payload if isinstance(row, dict)]
        if any(_text(row.get("gs_injerto_id")) and _text(row.get("gs_partida"))
               for row in direct):
            return [row for row in direct
                    if _text(row.get("gs_injerto_id")) and _text(row.get("gs_partida"))]
        found = []
        for value in payload:
            found.extend(_find_tunnel_records(value))
        return found
    if isinstance(payload, dict):
        if _text(payload.get("gs_injerto_id")) and _text(payload.get("gs_partida")):
            return [payload]
        # Recorre también envoltorios distintos, sin asumir el nombre del nodo
        # que use cada versión del script piloto.
        found = []
        for key, value in payload.items():
            if str(key).casefold() in {"metadata", "meta"}:
                continue
            found.extend(_find_tunnel_records(value))
        return found
    return []


def _local_created() -> str:
    # Conserva el formato español empleado por las altas de la interfaz.
    return datetime.now().astimezone().strftime("%d/%m/%Y, %H:%M:%S")


def _tunnel_rows(payload: Any, operational_day: date) -> list[dict[str, Any]]:
    source_rows = _find_tunnel_records(payload)
    if not source_rows:
        shape = type(payload).__name__
        keys = ", ".join(str(key) for key in payload.keys()) if isinstance(payload, dict) else ""
        raise ValueError(f"El JSON de Túnel no contiene filas reconocibles (tipo={shape}; claves={keys}).")
    result = []
    for row in source_rows:
        source_id = _text(row.get("gs_injerto_id"))
        part = _text(row.get("gs_partida"))
        if not source_id or not part:
            continue
        # El script GS recibe la fecha consultada (la fecha operativa del
        # parte). fecha_entrada es un dato de trazabilidad y puede ser anterior.
        day_iso = operational_day.isoformat()
        # La variedad/cultivo del parte es TSI_DENO (p.ej. MELON INJ 54 FN).
        # PAR_NMSM (p.ej. MINJ ARAGORN) se conserva como tipo de injerto GS.
        customer = _text(row.get("cliente"))
        variety = _text(row.get("tipo_siembra")) or _text(row.get("PAR_NMSM"))
        greenhouses = _text(row.get("invernaderos_gs"))
        greenhouse_code = _text(row.get("PAR_CAS") or row.get("par_cas"))
        street = _number(row.get("PIN_LOCA") or row.get("pin_loca"))
        trays = _number(row.get("bandejas"))
        item_id = _safe_id("tunel", source_id)
        item = {
            "id": item_id,
            "tipo": "tunel",
            "dia": _day_number(day_iso),
            "partida": part,
            "numBandejas": trays,
            "cliente": customer,
            "variedad": variety,
            "clienteVariedad": f"{customer} — {variety}" if variety else customer,
            "fentrega": _date_display(row.get("fecha_prevista")),
            "PAR_CAS": greenhouse_code,
            "PIN_LOCA": street,
            "invId": greenhouse_code or None,
            "calleDesde": street if street and street != "0" else None,
            "calleHasta": street if street and street != "0" else None,
            "invernaderosGS": greenhouses,
            "gsDetalles": {
                "idInjerto": source_id,
                "codigoCliente": _text(row.get("PAR_CCL")),
                "codigoTipoSiembra": _text(row.get("id_tipo_siembra")),
                "tipoSiembra": _text(row.get("tipo_siembra")),
                "tipoPartida": _text(row.get("PAR_NMSM")),
                "PAR_CAS": greenhouse_code,
                "PIN_LOCA": street,
                "plantas": _number(row.get("plantas")),
                "fechaEntrada": day_iso,
                "fechaPrevista": _nullable_text(row.get("fecha_prevista")),
                "fechaSalidaReal": _nullable_text(row.get("fecha_salida_real")),
                "estado": _text(row.get("estado_gs")),
                "observaciones": _text(row.get("observaciones")),
            },
        }
        item.update(_qc_defaults(item_id))
        item.update({"grosor": {}, "firmeza": {}, "segado": {},
                     "plagas": {}, "enfermedades": {}})
        item["origenGS"] = {
            "fuente": "gs", "modulo": "tunel", "id": source_id,
            "fechaISO": day_iso, "syncAt": datetime.now(timezone.utc).isoformat(),
        }
        # PAR_CAS y PIN_LOCA proceden de la partida y del registro de injerto
        # de GS; el texto agregado de invernaderos_gs se conserva aparte.
        result.append({"module": "tunel", "source_id": source_id, "day_iso": day_iso,
                       "item": item, "natural_key": _tunnel_natural(item)})
    return result


def _date_display(value: Any) -> str:
    text = _nullable_text(value)
    return date.fromisoformat(text[:10]).strftime("%d/%m/%Y") if text else ""


def _nullable_text(value: Any) -> str | None:
    text = _text(value)
    return text or None


def _qc_defaults(item_id: str) -> dict[str, Any]:
    return {
        "color": {}, "tamano": {}, "sanidad": {}, "flores": {}, "raices": {},
        "observaciones": "", "creadoPor": "GS (sincronizado)", "creadoEn": _local_created(),
    }


def _tunnel_natural(item: dict[str, Any]) -> tuple[str, ...]:
    return (str(item["dia"]), _text(item.get("partida")), _number(item.get("numBandejas")),
            _text(item.get("clienteVariedad")).casefold())


def _load_rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("lineas"), dict):
        raise ValueError("El JSON de Carga no contiene el bloque lineas esperado.")
    result = []
    for source_id, row in payload["lineas"].items():
        if not isinstance(row, dict):
            continue
        source_id = _text(source_id)
        part = _text(row.get("partida"))
        if not source_id or not part:
            continue
        delivery_iso = _date_iso(row.get("fecha_entrega"))
        day_iso = (date.fromisoformat(delivery_iso) - timedelta(days=2)).isoformat()
        customer = _text(row.get("cliente")) or _text(row.get("cliente_carga"))
        variety = _text(row.get("variedad"))
        trays = _number(row.get("bandejas"))
        location = _text(row.get("ubicacion_pdf"))
        item_id = _safe_id("carga", source_id)
        item = {
            "id": item_id,
            "tipo": "carga",
            "dia": _day_number(day_iso),
            "cliente": customer,
            "variedad": variety,
            "partida": part,
            "numBandejas": trays,
            "invernadero": location,
            "fentrega": _date_display(delivery_iso),
            "gsDetalles": {
                "idLineaCarga": source_id,
                "idCarga": _text(row.get("id_carga")),
                "fechaCarga": _nullable_text(row.get("fecha_carga")),
                "fechaEntrega": delivery_iso,
                "fechaPreparacionQC": day_iso,
                "hora": _text(row.get("hora")),
                "clienteCarga": _text(row.get("cliente_carga")),
                "codigoCliente": _text(row.get("codigo_cliente")),
                "codigoSiembra": _text(row.get("codigo_siembra")),
                "denominacionSiembra": _text(row.get("denominacion_siembra")),
                "plantas": _number(row.get("plantas")),
                "idInvernadero": _text(row.get("id_invernadero")),
                "carros": row.get("carros") if isinstance(row.get("carros"), list) else [],
            },
        }
        item.update(_qc_defaults(item_id))
        item["origenGS"] = {
            "fuente": "gs", "modulo": "carga", "id": source_id,
            "fechaISO": day_iso, "syncAt": datetime.now(timezone.utc).isoformat(),
        }
        result.append({"module": "carga", "source_id": source_id, "day_iso": day_iso,
                       "item": item, "natural_key": _load_natural(item)})
    return result


def _load_natural(item: dict[str, Any]) -> tuple[str, ...]:
    return (str(item["dia"]), _text(item.get("partida")), _number(item.get("numBandejas")),
            _text(item.get("cliente")).casefold(), _text(item.get("variedad")).casefold(),
            _text(item.get("invernadero")))


def _preinjerto_rows(payload: Any, module: str) -> list[dict[str, Any]]:
    """Adapta el snapshot GS al formato de registros que consume QC Preinjerto."""
    expected_category = {
        "preinjerto_patron": "patron",
        "preinjerto_variedad": "variedad",
    }.get(module)
    if not expected_category:
        raise ValueError(f"Módulo de Preinjerto no admitido: {module}")
    if not isinstance(payload, dict) or not isinstance(payload.get("partidas"), dict):
        raise ValueError("El JSON de Preinjerto no contiene el bloque partidas esperado.")

    result = []
    for source_id, source in payload["partidas"].items():
        if not isinstance(source, dict) or _text(source.get("QC Preinjerto")) != expected_category:
            continue
        part = _text(source.get("PARTIDA") or source_id)
        if not part:
            continue
        day_iso = _date_iso(source.get("F Siembra"))
        customer = _text(source.get("Nombre Cliente"))
        variety = _text(source.get("VARIEDAD"))
        greenhouse_code = _text(source.get("PAR_CAS"))
        street = _number(source.get("PAR_UBIC"))
        explicit_greenhouse = re.fullmatch(
            r"INVERNADERO\s+([A-Za-z0-9_-]+)",
            _text(source.get("Cliente Final")), re.IGNORECASE,
        )
        greenhouse_id = explicit_greenhouse.group(1) if explicit_greenhouse else greenhouse_code
        item_id = _safe_id(module, part)
        item = {
            "id": item_id,
            "tipo": module,
            "dia": _day_number(day_iso),
            "partida": part,
            "numBandejas": _number(source.get("Band")),
            "cliente": customer,
            "variedad": variety,
            "clienteVariedad": f"{customer} — {variety}" if variety else customer,
            "invId": greenhouse_id or None,
            "invernadero": _text(source.get("Cliente Final")) if explicit_greenhouse else "",
            "calleDesde": street if street and street != "0" else None,
            "calleHasta": street if street and street != "0" else None,
            "fSiembra": _date_display(day_iso),
            "fEntrega": _date_display(source.get("F Entrega")),
            "plantasSol": _number(source.get("Pl sol")),
            "plantasSem": _number(source.get("Sem")),
            "observaciones": _text(source.get("OBSERVA")),
            "gsDetalles": {
                "codigoCliente": _text(source.get("Cod Cliente")),
                "tipoSolicitud": _text(source.get("Tipo de Solicitud")),
                "tipoSiembra": _text(source.get("Tipo de Siembra")),
                "soporteSiembra": _text(source.get("Soporte de Siembra")),
                "fechaSiembra": day_iso,
                "fechaEntrega": _nullable_text(source.get("F Entrega")),
                "fechaEncargo": _nullable_text(source.get("Fecha encargo")),
                "semanaSiembra": _nullable_text(source.get("Semana Siembra")),
                "sustitucion": _nullable_text(source.get("S?")),
                "bandasActuales": _nullable_text(source.get("Band Act")),
                "semillasActuales": _nullable_text(source.get("Sem act")),
                "germinacion": _nullable_text(source.get("Germ")),
                "partidaBiologica": _nullable_text(source.get("Partida biológica?")),
                "lote": _nullable_text(source.get("Nº Lote")),
                "clienteFinal": _nullable_text(source.get("Cliente Final")),
                "PAR_CAS": greenhouse_code,
                "PAR_UBIC": street,
                "fechaRealSiembra": _nullable_text(source.get("Fecha Real Siembra")),
            },
        }
        item.update(_qc_defaults(item_id))
        item["origenGS"] = {
            "fuente": "gs", "modulo": module, "id": part,
            "fechaISO": day_iso, "syncAt": datetime.now(timezone.utc).isoformat(),
        }
        result.append({"module": module, "source_id": part, "day_iso": day_iso,
                       "item": item, "natural_key": _load_natural(item)})
    return result


def _matches_natural(candidate: dict[str, Any], row: dict[str, Any]) -> bool:
    if candidate.get("tipo") != row["module"]:
        return False
    if row["module"] == "carga":
        return _load_natural(candidate) == row["natural_key"]

    incoming = row["item"]
    if str(candidate.get("dia")) != str(incoming.get("dia")):
        return False
    if _text(candidate.get("partida")) != _text(incoming.get("partida")):
        return False
    if _number(candidate.get("numBandejas")) != _number(incoming.get("numBandejas")):
        return False
    candidate_client = _text(candidate.get("cliente"))
    candidate_variety = _text(candidate.get("variedad"))
    combined = _text(candidate.get("clienteVariedad"))
    if (not candidate_client or not candidate_variety) and " — " in combined:
        left, right = combined.rsplit(" — ", 1)
        candidate_client = candidate_client or left.strip()
        candidate_variety = candidate_variety or right.strip()
    if candidate_client.casefold() != _text(incoming.get("cliente")).casefold():
        return False
    # Los PDFs históricos muestran unas veces PAR_NMSM y otras la
    # denominación de siembra; ambas se guardan en gsDetalles.
    varieties = {_text(incoming.get("variedad")).casefold(),
                 _text(incoming.get("gsDetalles", {}).get("tipoSiembra")).casefold(),
                 _text(incoming.get("gsDetalles", {}).get("tipoPartida")).casefold()}
    return candidate_variety.casefold() in varieties


def _source_payload(module: str, path: Path, operational_day: date) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as stream:
        payload = json.load(stream)
    if module == "tunel":
        return _tunnel_rows(payload, operational_day)
    if module in ("preinjerto_patron", "preinjerto_variedad"):
        return _preinjerto_rows(payload, module)
    return _load_rows(payload)


def _merge_gs(existing: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
    """GS manda solo en sus datos; conserva checklist, fotos y asignación operativa."""
    merged = dict(existing or {})
    location_fields = {"invId", "calleDesde", "calleHasta", "tramos"}

    def has_location(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return value.strip() not in ("", "0")
        if isinstance(value, (list, tuple, dict)):
            return bool(value)
        return bool(value)

    protected = {"color", "tamano", "sanidad", "flores", "raices", "grosor",
                 "firmeza", "segado", "plagas", "enfermedades", "observaciones",
                 "fotos", "foto", "invId", "calleDesde", "calleHasta", "tramos",
                 "creadoPor", "creadoEn", "origenPdf", "origenAltaQC"}
    for key, value in incoming.items():
        # El PDF de extensiones fija el día real de salida de Túnel y deja
        # extensionFecha como marca. Una relectura diaria de GS no debe
        # devolver la inspección al día de entrada/consulta.
        if key == "dia" and existing and existing.get("extensionFecha"):
            continue
        if key in protected and key in merged:
            if key not in location_fields or has_location(merged[key]) or not has_location(value):
                continue
        merged[key] = value
    # Conserva las correcciones puntuales de APP sobre los valores fuente GS.
    correction = merged.get("edicionQC")
    correction_fields = correction.get("campos") if isinstance(correction, dict) else None
    if (merged.get("tipo") in ("preinjerto_patron", "preinjerto_variedad")
            and isinstance(correction_fields, dict)):
        editable = ("partida", "cliente", "variedad", "numBandejas", "invId",
                    "calleDesde", "calleHasta", "PAR_CAS", "PAR_UBIC")
        for field in editable:
            if field in correction_fields:
                merged[field] = correction_fields[field]
        if "cliente" in correction_fields or "variedad" in correction_fields:
            customer = _text(merged.get("cliente"))
            variety = _text(merged.get("variedad"))
            merged["clienteVariedad"] = f"{customer} — {variety}" if variety else customer
        if "PAR_CAS" in correction_fields or "PAR_UBIC" in correction_fields:
            details = dict(merged.get("gsDetalles") or {})
            for field in ("PAR_CAS", "PAR_UBIC"):
                if field in correction_fields:
                    details[field] = correction_fields[field] or None
            merged["gsDetalles"] = details
    # Mantiene los campos de QC aun si una versión antigua tenía alguno ausente.
    for key in ("color", "tamano", "sanidad", "flores", "raices", "grosor",
                "firmeza", "segado", "plagas", "enfermedades"):
        if not isinstance(merged.get(key), dict):
            merged[key] = {}
    if not isinstance(merged.get("observaciones"), str):
        merged["observaciones"] = ""
    return merged


def sync_qc_items(module: str, json_path: Path, credential_path: Path,
                  operational_day: date) -> tuple[int, int]:
    """Upsert idempotente, incluyendo los shards que consume la aplicación."""
    if module not in ("tunel", "carga", "preinjerto_patron", "preinjerto_variedad"):
        raise ValueError(f"Módulo QC no admitido: {module}")
    from firebase_admin import credentials, db, delete_app, initialize_app

    with credential_path.open("r", encoding="utf-8") as stream:
        account = json.load(stream)
    if account.get("project_id") != PROJECT_ID:
        raise ValueError("La cuenta de servicio no corresponde a Firebase TEST.")
    # El script piloto de Túnel también inicializa Firebase dentro de este
    # mismo proceso. Un nombre fijo colisiona con esa instancia o con otra
    # fecha del lote; el identificador único evita reutilizarla por accidente.
    app_name = f"gs-qc-{module}-{uuid.uuid4().hex}"
    app = initialize_app(credentials.Certificate(str(credential_path)),
                         {"databaseURL": DATABASE_URL}, name=app_name)
    try:
        rows = _source_payload(module, json_path, operational_day)
        if not rows:
            return (0, 0)
        imports_ref = db.reference(f"{IMPORT_INDEX}/{module}", app=app)
        index = imports_ref.get() or {}
        if not isinstance(index, dict):
            index = {}

        # Se cargan una vez los shards destino, lo que permite reconocer y
        # enlazar altas PDF existentes sin duplicarlas.
        shards: dict[str, dict[str, Any]] = {}
        for row in rows:
            day_no = row["item"]["dia"]
            shard = _shard(day_no, module)
            if shard not in shards:
                value = db.reference(shard, app=app).get() or {}
                shards[shard] = value if isinstance(value, dict) else {}

        used_ids: set[str] = set()
        affected_shards: set[str] = set()
        created = updated = 0
        for row in rows:
            source_id = row["source_id"]
            incoming = row["item"]
            desired_shard = _shard(incoming["dia"], module)
            link = index.get(source_id) if isinstance(index.get(source_id), dict) else {}
            item_id = _text(link.get("itemId")) or incoming["id"]
            old_item = db.reference(f"{ITEMS_ROOT}/{item_id}", app=app).get()
            if not isinstance(old_item, dict):
                old_item = None

            # Primera importación: enlaza una fila PDF/manual idéntica si está
            # en el shard de destino. Cada item existente solo se consume una vez.
            if old_item is None and not link:
                candidates = shards.get(desired_shard, {})
                for candidate_id, candidate in candidates.items():
                    if candidate_id in used_ids or not isinstance(candidate, dict):
                        continue
                    if _matches_natural(candidate, row):
                        item_id, old_item = str(candidate_id), candidate
                        break

            if item_id in used_ids:
                # Si la fuente trae varias filas realmente idénticas, conserva
                # su identidad independiente en vez de fusionarlas.
                item_id = incoming["id"]
                old_item = db.reference(f"{ITEMS_ROOT}/{item_id}", app=app).get()
                if not isinstance(old_item, dict):
                    old_item = None
            used_ids.add(item_id)

            incoming["id"] = item_id
            old_shard = _shard(old_item["dia"], module) if old_item and old_item.get("tipo") == module else None
            item_ref = db.reference(f"{ITEMS_ROOT}/{item_id}", app=app)
            item_ref.transaction(lambda current: _merge_gs(current, incoming))
            merged = item_ref.get()
            if not isinstance(merged, dict):
                raise RuntimeError(f"Firebase no devolvió el item QC {item_id} tras guardarlo.")
            effective_shard = _shard(int(merged["dia"]), module)
            shard_ref = db.reference(f"{effective_shard}/{item_id}", app=app)
            shard_ref.transaction(lambda current: _merge_gs(current or merged, incoming))
            merged = shard_ref.get() or merged
            shards.setdefault(effective_shard, {})[item_id] = merged
            affected_shards.add(effective_shard)
            if old_shard and old_shard != effective_shard:
                if old_shard not in shards:
                    prior = db.reference(old_shard, app=app).get() or {}
                    shards[old_shard] = prior if isinstance(prior, dict) else {}
                db.reference(f"{old_shard}/{item_id}", app=app).delete()
                shards.setdefault(old_shard, {}).pop(item_id, None)
                affected_shards.add(old_shard)
            imports_ref.child(source_id).set({"itemId": item_id, "day": merged["dia"],
                                              "sourceDay": incoming["origenGS"]["fechaISO"],
                                              "shard": effective_shard,
                                              "syncAt": datetime.now(timezone.utc).isoformat()})
            if old_item is None:
                created += 1
            else:
                updated += 1

        # El índice v2 es el catálogo que permite a la app descubrir shards.
        counts = {}
        for key in affected_shards:
            value = db.reference(key, app=app).get(shallow=True) or {}
            counts[key] = len(value) if isinstance(value, dict) else 0
        index_ref = db.reference(V2_INDEX, app=app)
        def update_index(current):
            if not isinstance(current, dict):
                current = {}
            current = dict(current)
            current["shards"] = dict(current.get("shards") or {})
            for key, count in counts.items():
                match = re.fullmatch(r"lasala-control-items-v2-(tunel|carga|preinjerto_patron|preinjerto_variedad)-q(\d+)", key)
                if not match:
                    continue
                kind, quarter = match.group(1), int(match.group(2))
                shard_key = f"{kind}|{quarter}"
                current["shards"][shard_key] = {
                    **(current["shards"].get(shard_key) or {}),
                    "key": key, "tipo": kind, "q": quarter, "count": count,
                }
            return current
        index_ref.transaction(update_index)
        return created, updated
    finally:
        delete_app(app)


def sync_from_connector(script_name: str, day: date, credential_path: Path) -> tuple[int, int]:
    module = "tunel" if "tunel" in script_name else "carga"
    filename = f"pilot_gs_qc_{module}_{day.isoformat()}.json"
    path = Path(__file__).resolve().parent / filename
    if not path.is_file():
        raise FileNotFoundError(f"No existe el JSON validado del conector: {path}")
    return sync_qc_items(module, path, credential_path, day)


def sync_preinjerto_from_connector(json_path: Path, credential_path: Path,
                                   operational_day: date) -> dict[str, tuple[int, int]]:
    """Importa Patrones y Variedades en los shards QC que ya consulta la app."""
    return {
        module: sync_qc_items(module, json_path, credential_path, operational_day)
        for module in ("preinjerto_patron", "preinjerto_variedad")
    }
