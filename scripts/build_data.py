#!/usr/bin/env python3
"""
Deterministic Data Compiler, Unit Normalizer & Integrity Gate for NASA Flame Trace.
Rejects nonfinite values, invalid units, duplicate IDs, broken typed references,
absent provenance on released facts, invalid phase order, radius/diameter mismatch,
uncalibrated speed derivation, and CSV formula injection.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
PSIA_TO_KPA = 6.894757
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def fail(msg: str) -> None:
    print(f"[BUILD_DATA ERROR] {msg}", file=sys.stderr)
    sys.exit(1)


def assert_safe_csv_text(val: str | None, field_name: str, row_id: str) -> None:
    if val is None or val == "":
        return
    if val.startswith(FORMULA_PREFIXES):
        fail(
            f"CSV formula injection risk in row '{row_id}', field '{field_name}': "
            f"value '{val}' starts with a prohibited character {FORMULA_PREFIXES}."
        )


def parse_nullable_str(raw: str | None, field_name: str, row_id: str) -> str | None:
    if raw is None:
        return None
    cleaned = raw.strip()
    if cleaned == "" or cleaned.lower() == "null":
        return None
    assert_safe_csv_text(cleaned, field_name, row_id)
    return cleaned


def parse_nullable_float(raw: str | None, field_name: str, row_id: str) -> float | None:
    if raw is None:
        return None
    cleaned = raw.strip()
    if cleaned == "" or cleaned.lower() == "null":
        return None
    try:
        val = float(cleaned)
    except ValueError:
        fail(f"Non-numeric float '{raw}' in row '{row_id}', field '{field_name}'.")
    if not math.isfinite(val):
        fail(f"Non-finite float '{raw}' in row '{row_id}', field '{field_name}'.")
    return val


def normalize_oxygen_pct(val: float | None, unit: str | None, row_id: str) -> float | None:
    if val is None:
        return None
    u = (unit or "pct").strip().lower()
    if u in ("fraction", "vol_fraction", "mol_fraction"):
        pct = round(val * 100.0, 4)
    elif u in ("pct", "%", "vol_pct", "percent", "% o2"):
        pct = round(val, 4)
    else:
        fail(f"Unsupported oxygen unit '{unit}' in row '{row_id}'.")
    if pct < 0.0 or pct > 100.0:
        fail(f"Normalized oxygen {pct}% out of [0, 100] bounds in row '{row_id}'.")
    return pct


def normalize_pressure(
    val: float | None, unit: str | None, basis: str, row_id: str
) -> tuple[float | None, float | None]:
    if val is None:
        return (None, None)
    if basis == "gauge":
        fail(
            f"Row '{row_id}' reports gauge pressure without a documented reference "
            f"ambient pressure conversion rule."
        )
    u = (unit or "kpa").strip().lower()
    if u == "psia":
        kpa = round(val * PSIA_TO_KPA, 1)
        psia = round(val, 2)
        return (kpa, psia)
    if u == "kpa":
        kpa = round(val, 1)
        psia = round(val / PSIA_TO_KPA, 2)
        return (kpa, psia)
    if u == "atm":
        kpa = round(val * 101.325, 1)
        psia = round(kpa / PSIA_TO_KPA, 2)
        return (kpa, psia)
    fail(f"Unsupported pressure unit '{unit}' in row '{row_id}'.")


def normalize_airflow(
    val: float | None,
    unit: str | None,
    calibration_id: str | None,
    row_id: str,
) -> float | None:
    if val is None:
        return None
    if not calibration_id:
        fail(
            f"Row '{row_id}' provides numeric airflow '{val}' without a documented "
            f"calibration_id."
        )
    u = (unit or "cm/s").strip().lower()
    if u == "m/s":
        return round(val * 100.0, 4)
    if u == "cm/s":
        return round(val, 4)
    if u == "mm/s":
        return round(val / 10.0, 4)
    fail(f"Unsupported airflow unit '{unit}' in row '{row_id}'.")


def compile_catalog(data_dir: Path, gen_dir: Path, export_dir: Path) -> None:
    sources_path = data_dir / "sources.json"
    investigations_path = data_dir / "investigations.json"
    evidence_path = data_dir / "evidence.json"
    exclusions_path = data_dir / "exclusions.json"
    runs_csv_path = data_dir / "runs.csv"
    phases_csv_path = data_dir / "phases.csv"

    for p in (
        sources_path,
        investigations_path,
        evidence_path,
        exclusions_path,
        runs_csv_path,
        phases_csv_path,
    ):
        if not p.exists():
            fail(f"Required input file missing: {p}")

    sources: list[dict[str, Any]] = json.loads(sources_path.read_text(encoding="utf-8"))
    investigations: list[dict[str, Any]] = json.loads(
        investigations_path.read_text(encoding="utf-8")
    )
    evidence_list: list[dict[str, Any]] = json.loads(
        evidence_path.read_text(encoding="utf-8")
    )
    exclusions: list[dict[str, Any]] = json.loads(
        exclusions_path.read_text(encoding="utf-8")
    )

    # 1. Validate unique primary keys & foreign keys on JSON entities
    source_ids: set[str] = set()
    for s in sources:
        sid = s.get("id")
        if not sid:
            fail("Source entry missing 'id'")
        if sid in source_ids:
            fail(f"Duplicate source.id '{sid}'")
        if not s.get("url") or not s.get("doi_or_ntrs_id"):
            fail(f"Source '{sid}' missing required url or doi_or_ntrs_id")
        source_ids.add(sid)

    evidence_ids: set[str] = set()
    evidence_by_id: dict[str, dict[str, Any]] = {}
    for ev in evidence_list:
        eid = ev.get("evidence_id")
        if not eid:
            fail("Evidence entry missing 'evidence_id'")
        if eid in evidence_ids:
            fail(f"Duplicate evidence_id '{eid}'")
        if ev.get("source_id") not in source_ids:
            fail(f"Evidence '{eid}' references unknown source_id '{ev.get('source_id')}'")
        if not ev.get("locator_detail") or (
            not ev.get("printed_page") and not ev.get("pdf_page")
        ):
            fail(
                f"Evidence '{eid}' is missing required provenance locator_detail or page numbers"
            )
        norm_val = ev.get("normalized_value")
        if norm_val is not None and (
            not isinstance(norm_val, (int, float)) or not math.isfinite(float(norm_val))
        ):
            fail(f"Evidence '{eid}' has non-finite normalized_value '{norm_val}'")
        evidence_ids.add(eid)
        evidence_by_id[eid] = ev

    investigation_ids: set[str] = set()
    for inv in investigations:
        iid = inv.get("id")
        if not iid:
            fail("Investigation entry missing 'id'")
        if iid in investigation_ids:
            fail(f"Duplicate investigation.id '{iid}'")
        for sid in inv.get("source_ids", []):
            if sid not in source_ids:
                fail(f"Investigation '{iid}' references unknown source_id '{sid}'")
        lead_eids = inv.get("research_lead", {}).get("evidence_ids", [])
        if not lead_eids:
            fail(f"Investigation '{iid}' research_lead has empty evidence_ids")
        for eid in lead_eids:
            if eid not in evidence_ids:
                fail(
                    f"Investigation '{iid}' research_lead references unknown evidence_id '{eid}'"
                )
        investigation_ids.add(iid)

    for excl in exclusions:
        if excl.get("source_id") not in source_ids:
            fail(f"Exclusion '{excl.get('exclusion_id')}' references unknown source_id")

    # 2. Parse & Normalize Runs CSV
    runs: list[dict[str, Any]] = []
    run_ids: set[str] = set()
    original_run_ids: set[str] = set()

    with runs_csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = parse_nullable_str(row.get("run_id"), "run_id", "unknown")
            if not rid:
                fail("Row in runs.csv is missing run_id")
            if rid in run_ids:
                fail(f"Duplicate run_id '{rid}' in runs.csv")
            run_ids.add(rid)

            orig_rid = (
                parse_nullable_str(row.get("original_run_id"), "original_run_id", rid)
                or rid
            )
            if orig_rid in original_run_ids:
                fail(f"Duplicate original_run_id '{orig_rid}' in runs.csv")
            original_run_ids.add(orig_rid)

            inv_id = parse_nullable_str(
                row.get("investigation_id"), "investigation_id", rid
            )
            if not inv_id or inv_id not in investigation_ids:
                fail(f"Run '{rid}' references unknown investigation_id '{inv_id}'")

            radius_mm = parse_nullable_float(
                row.get("rod_radius_mm"), "rod_radius_mm", rid
            )
            diameter_mm = parse_nullable_float(
                row.get("rod_diameter_mm"), "rod_diameter_mm", rid
            )
            if radius_mm is not None and diameter_mm is not None:
                if abs(diameter_mm - 2.0 * radius_mm) > 1e-3:
                    fail(
                        f"Run '{rid}' geometry mismatch: diameter ({diameter_mm} mm) != "
                        f"2 * radius ({radius_mm} mm)"
                    )

            length_mm = parse_nullable_float(row.get("length_mm"), "length_mm", rid)
            cal_id = parse_nullable_str(row.get("calibration_id"), "calibration_id", rid)
            raw_airflow = parse_nullable_float(
                row.get("airflow_cm_s"), "airflow_cm_s", rid
            )
            airflow_unit = parse_nullable_str(
                row.get("airflow_unit"), "airflow_unit", rid
            )
            norm_airflow = normalize_airflow(raw_airflow, airflow_unit, cal_id, rid)

            o2_unit = parse_nullable_str(row.get("oxygen_unit"), "oxygen_unit", rid)
            init_o2 = normalize_oxygen_pct(
                parse_nullable_float(
                    row.get("initial_oxygen_pct"), "initial_oxygen_pct", rid
                ),
                o2_unit,
                rid,
            )
            final_o2 = normalize_oxygen_pct(
                parse_nullable_float(
                    row.get("final_oxygen_pct"), "final_oxygen_pct", rid
                ),
                o2_unit,
                rid,
            )
            end_o2 = normalize_oxygen_pct(
                parse_nullable_float(
                    row.get("endpoint_oxygen_pct"), "endpoint_oxygen_pct", rid
                ),
                o2_unit,
                rid,
            )

            p_basis = (
                parse_nullable_str(row.get("pressure_basis"), "pressure_basis", rid)
                or "unreported"
            )
            p_val = parse_nullable_float(
                row.get("pressure_value"), "pressure_value", rid
            )
            p_unit = parse_nullable_str(row.get("pressure_unit"), "pressure_unit", rid)
            norm_kpa, norm_psia = normalize_pressure(p_val, p_unit, p_basis, rid)

            ev_raw = parse_nullable_str(row.get("evidence_ids"), "evidence_ids", rid)
            if not ev_raw:
                fail(f"Run '{rid}' has empty evidence_ids")
            ev_ids = [e.strip() for e in ev_raw.split(";") if e.strip()]
            for eid in ev_ids:
                if eid not in evidence_ids:
                    fail(f"Run '{rid}' references unknown evidence_id '{eid}'")

            mq_raw = parse_nullable_str(
                row.get("measured_quantities_reported"),
                "measured_quantities_reported",
                rid,
            )
            mq_list = (
                [m.strip() for m in mq_raw.split(";") if m.strip()]
                if mq_raw
                else ["quenching"]
            )

            runs.append(
                {
                    "run_id": rid,
                    "original_run_id": orig_rid,
                    "investigation_id": inv_id,
                    "sample_id": parse_nullable_str(
                        row.get("sample_id"), "sample_id", rid
                    )
                    or "UNKNOWN_SAMPLE",
                    "facility_platform": parse_nullable_str(
                        row.get("facility_platform"), "facility_platform", rid
                    ),
                    "material_variant": parse_nullable_str(
                        row.get("material_variant"), "material_variant", rid
                    ),
                    "geometry_shape": parse_nullable_str(
                        row.get("geometry_shape"), "geometry_shape", rid
                    ),
                    "rod_radius_mm": radius_mm,
                    "rod_diameter_mm": diameter_mm,
                    "length_mm": length_mm,
                    "gravity_regime": parse_nullable_str(
                        row.get("gravity_regime"), "gravity_regime", rid
                    ),
                    "gravity_method": parse_nullable_str(
                        row.get("gravity_method"), "gravity_method", rid
                    ),
                    "flow_direction": parse_nullable_str(
                        row.get("flow_direction"), "flow_direction", rid
                    )
                    or "unknown",
                    "flow_protocol": parse_nullable_str(
                        row.get("flow_protocol"), "flow_protocol", rid
                    )
                    or "unknown",
                    "raw_flow_display": parse_nullable_str(
                        row.get("raw_flow_display"), "raw_flow_display", rid
                    ),
                    "fan_setting": parse_nullable_str(
                        row.get("fan_setting"), "fan_setting", rid
                    ),
                    "calibration_id": cal_id,
                    "airflow_cm_s": norm_airflow,
                    "raw_oxygen_display": parse_nullable_str(
                        row.get("raw_oxygen_display"), "raw_oxygen_display", rid
                    ),
                    "initial_oxygen_pct": init_o2,
                    "final_oxygen_pct": final_o2,
                    "endpoint_oxygen_pct": end_o2,
                    "pressure_kpa": norm_kpa,
                    "pressure_psia": norm_psia,
                    "pressure_basis": p_basis,
                    "ignition_method": parse_nullable_str(
                        row.get("ignition_method"), "ignition_method", rid
                    ),
                    "observed_outcome": parse_nullable_str(
                        row.get("observed_outcome"), "observed_outcome", rid
                    )
                    or "unknown",
                    "measured_quantities_reported": mq_list,
                    "anomalies": parse_nullable_str(
                        row.get("anomalies"), "anomalies", rid
                    ),
                    "evidence_ids": ev_ids,
                    "review_status": parse_nullable_str(
                        row.get("review_status"), "review_status", rid
                    )
                    or "provisional",
                    "human_signoff_status": parse_nullable_str(
                        row.get("human_signoff_status"), "human_signoff_status", rid
                    )
                    or "demo_reviewed_pending_day14_final_signoff",
                }
            )

    # 3. Parse & Validate Phases CSV (allow nullable run_id when figure_id is present; enforce 1..N ordinal sequence)
    phases: list[dict[str, Any]] = []
    phase_ids: set[str] = set()
    phases_by_parent: dict[str, list[int]] = {}

    with phases_csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = parse_nullable_str(row.get("phase_id"), "phase_id", "unknown")
            if not pid:
                fail("Row in phases.csv is missing phase_id")
            if pid in phase_ids:
                fail(f"Duplicate phase_id '{pid}'")
            phase_ids.add(pid)

            rid = parse_nullable_str(row.get("run_id"), "run_id", pid)
            fig_id = parse_nullable_str(row.get("figure_id"), "figure_id", pid)
            if rid is not None and rid not in run_ids:
                fail(f"Phase '{pid}' references unknown run_id '{rid}'")
            if rid is None and fig_id is None:
                fail(f"Phase '{pid}' must specify either run_id or figure_id")

            inv_id = (
                parse_nullable_str(row.get("investigation_id"), "investigation_id", pid)
                or "BASS-II"
            )
            if inv_id not in investigation_ids:
                fail(f"Phase '{pid}' references unknown investigation_id '{inv_id}'")

            parent_key = rid or f"FIG:{fig_id}"
            ord_val = parse_nullable_float(row.get("ordinal"), "ordinal", pid)
            if ord_val is None or int(ord_val) != ord_val or int(ord_val) < 1:
                fail(f"Phase '{pid}' has invalid ordinal '{ord_val}'")
            ordinal = int(ord_val)
            phases_by_parent.setdefault(parent_key, []).append(ordinal)

            o2_val = parse_nullable_float(row.get("oxygen_pct"), "oxygen_pct", pid)
            if o2_val is not None and (o2_val < 0.0 or o2_val > 100.0):
                fail(f"Phase '{pid}' has out-of-range oxygen_pct '{o2_val}'")

            ev_id = parse_nullable_str(row.get("evidence_id"), "evidence_id", pid)
            if not ev_id or ev_id not in evidence_ids:
                fail(f"Phase '{pid}' references unknown evidence_id '{ev_id}'")

            phases.append(
                {
                    "phase_id": pid,
                    "run_id": rid,
                    "figure_id": fig_id,
                    "investigation_id": inv_id,
                    "ordinal": ordinal,
                    "elapsed_time_s": parse_nullable_float(
                        row.get("elapsed_time_s"), "elapsed_time_s", pid
                    ),
                    "raw_flow_display": parse_nullable_str(
                        row.get("raw_flow_display"), "raw_flow_display", pid
                    ),
                    "airflow_cm_s": parse_nullable_float(
                        row.get("airflow_cm_s"), "airflow_cm_s", pid
                    ),
                    "oxygen_pct": round(o2_val, 4) if o2_val is not None else None,
                    "oxygen_basis": parse_nullable_str(
                        row.get("oxygen_basis"), "oxygen_basis", pid
                    )
                    or "staged",
                    "observation": parse_nullable_str(
                        row.get("observation"), "observation", pid
                    )
                    or "",
                    "evidence_id": ev_id,
                    "review_status": parse_nullable_str(
                        row.get("review_status"), "review_status", pid
                    )
                    or "verified",
                }
            )

    for parent_key, ords in phases_by_parent.items():
        expected = list(range(1, len(ords) + 1))
        if sorted(ords) != expected:
            fail(
                f"Parent '{parent_key}' has non-sequential phase ordinals: {ords} (expected {expected})"
            )

    # 4. Compute Repeatable SHA-256 Content Hash over Normalized Payload
    core_payload = {
        "sources": sources,
        "investigations": investigations,
        "runs": runs,
        "phases": phases,
        "evidence": evidence_list,
        "exclusions": exclusions,
    }
    canonical_bytes = json.dumps(
        core_payload, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    sha256_hash = hashlib.sha256(canonical_bytes).hexdigest()
    catalog_version = f"2026.11.14-{sha256_hash[:8]}"

    verified_runs = [r for r in runs if r["review_status"] == "verified"]
    provisional_runs = [r for r in runs if r["review_status"] == "provisional"]
    verified_phases = [p for p in phases if p["review_status"] == "verified"]

    catalog_bundle = {
        "catalog_version": catalog_version,
        "sha256_hash": sha256_hash,
        "generated_at": "2026-11-14T09:00:00Z",
        "counts": {
            "sources": len(sources),
            "investigations": len(investigations),
            "runs": len(runs),
            "verified_runs": len(verified_runs),
            "provisional_runs": len(provisional_runs),
            "published_pmma_cohort_runs": 24,
            "phases": len(phases),
            "evidence": len(evidence_list),
            "exclusions": len(exclusions),
        },
        **core_payload,
    }

    gen_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)

    (gen_dir / "catalog.json").write_text(
        json.dumps(catalog_bundle, indent=2) + "\n", encoding="utf-8"
    )

    # 5. Emit Verified Researcher Exports in public/exports/*
    export_runs_cols = [
        "run_id",
        "original_run_id",
        "investigation_id",
        "sample_id",
        "facility_platform",
        "material_variant",
        "geometry_shape",
        "rod_radius_mm",
        "rod_diameter_mm",
        "length_mm",
        "gravity_regime",
        "gravity_method",
        "flow_direction",
        "flow_protocol",
        "raw_flow_display",
        "fan_setting",
        "calibration_id",
        "airflow_cm_s",
        "raw_oxygen_display",
        "initial_oxygen_pct",
        "final_oxygen_pct",
        "endpoint_oxygen_pct",
        "pressure_kpa",
        "pressure_psia",
        "pressure_basis",
        "ignition_method",
        "observed_outcome",
        "measured_quantities_reported",
        "anomalies",
        "evidence_ids",
        "review_status",
        "human_signoff_status",
    ]

    with (export_dir / "runs.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=export_runs_cols)
        writer.writeheader()
        for r in verified_runs:
            row_copy = dict(r)
            row_copy["evidence_ids"] = ";".join(r["evidence_ids"])
            row_copy["measured_quantities_reported"] = ";".join(
                r["measured_quantities_reported"]
            )
            writer.writerow(row_copy)

    export_phases_cols = [
        "phase_id",
        "run_id",
        "figure_id",
        "investigation_id",
        "ordinal",
        "elapsed_time_s",
        "raw_flow_display",
        "airflow_cm_s",
        "oxygen_pct",
        "oxygen_basis",
        "observation",
        "evidence_id",
        "review_status",
    ]

    with (export_dir / "phases.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=export_phases_cols)
        writer.writeheader()
        for p in verified_phases:
            writer.writerow(p)

    data_dictionary = {
        "catalog_version": catalog_version,
        "sha256_hash": sha256_hash,
        "unit_normalizations": {
            "oxygen_pct": "Volume percent (%). Fractions multiplied by 100.",
            "pressure_kpa": "Absolute kilopascals (kPa). Converted from psia via x 6.894757. Unreported stays null.",
            "airflow_cm_s": "Run velocity in cm/s. Converted from m/s via x 100 only when calibration_id is present. Figure 6.4 phase velocities and transition times are approximate readings from the plotted trace.",
            "dimensions_mm": "Sample radius, diameter (2 * radius), and length in millimeters (mm).",
        },
        "null_semantics": "Null values indicate unreported or unmeasured quantities and never match each other in run comparisons.",
        "counts_distinction": "published_pmma_cohort_runs (24) reflects the cohort count reported by NTRS 20150008961; verified_runs reflects rows individually verified in runs.csv; phases are tracked separately and never inflate run counts.",
    }
    (export_dir / "data_dictionary.json").write_text(
        json.dumps(data_dictionary, indent=2) + "\n", encoding="utf-8"
    )

    sources_by_id = {s["id"]: s for s in sources}
    evidence_locator_map = {}
    for eid, ev in evidence_by_id.items():
        src = sources_by_id[ev["source_id"]]
        evidence_locator_map[eid] = {
            "evidence_id": eid,
            "source_id": ev["source_id"],
            "source_title": src["title"],
            "source_url": src["url"],
            "doi_or_ntrs_id": src["doi_or_ntrs_id"],
            "record_id": ev["record_id"],
            "scope": ev["scope"],
            "field_name": ev["field_name"],
            "printed_page": ev["printed_page"],
            "pdf_page": ev["pdf_page"],
            "locator_detail": ev["locator_detail"],
            "original_value": ev["original_value"],
            "original_unit": ev["original_unit"],
            "normalized_value": ev["normalized_value"],
            "normalized_unit": ev["normalized_unit"],
            "measurement_basis": ev["measurement_basis"],
        }

    manifest = {
        "catalog_version": catalog_version,
        "sha256_hash": sha256_hash,
        "counts": catalog_bundle["counts"],
        "sources": sources_by_id,
        "evidence_locators": evidence_locator_map,
        "exclusions": exclusions,
    }
    (export_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    print(
        f"[BUILD_DATA OK] version={catalog_version} "
        f"runs={len(runs)} (verified={len(verified_runs)}, provisional={len(provisional_runs)}, published_cohort=24) "
        f"phases={len(phases)} evidence={len(evidence_list)}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile Flame Trace scientific catalog")
    parser.add_argument("--data-dir", type=Path, default=ROOT_DIR / "data")
    parser.add_argument("--gen-dir", type=Path, default=ROOT_DIR / "data" / "generated")
    parser.add_argument(
        "--export-dir", type=Path, default=ROOT_DIR / "public" / "exports"
    )
    args = parser.parse_args()
    compile_catalog(args.data_dir, args.gen_dir, args.export_dir)


if __name__ == "__main__":
    main()
