"""
GTSS Completeness Checker

Validates GTSS (General Traffic Signal Specification) export files and scores
each signal's completeness based on five categories with equal weight (20% each):
  1. Location   - signal has valid lat/lng coordinates
  2. Approaches - signal has at least one approach defined
  3. Phases     - signal has at least one phase defined
  4. Detection  - signal has at least one detector defined
  5. Timing     - signal has at least one timing entry defined
"""

import csv
import io
import zipfile
from dataclasses import dataclass, field


REQUIRED_FILES = {
    "agency.txt",
    "signals.txt",
    "approaches.txt",
    "phases.txt",
    "detectors.txt",
    "basic_timings.txt",
}

AGENCY_FIELDS = ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_email"]
SIGNAL_FIELDS = ["signal_id", "agency_id", "latitude", "longitude"]
APPROACH_FIELDS = ["approach_id", "signal_id", "street_name", "compass_bearing", "posted_speed"]
PHASE_FIELDS = ["phase", "signal_id", "movement_type", "num_of_lanes", "approach_id", "is_overlap", "pedestrian_phase_enabled"]
DETECTOR_FIELDS = ["channel", "signal_id", "phase", "description", "purpose", "vehicle_type", "lane", "technology_type", "length", "stopbar_setback_dist"]
TIMING_FIELDS = ["phase", "signal_id", "ped_walk", "ped_clearance", "leading_ped_interval", "min_green", "max_green", "yellow", "all_red", "veh_recall_type", "ped_recall"]

VALID_MOVEMENT_TYPES = {"T", "L", "LT", "TL", "FYA", "U", "R", "TR", "PED"}
VALID_PURPOSES = {"Stop Bar", "Advanced", "Count", "stop bar", "advanced", "count"}
VALID_TECHNOLOGY_TYPES = {"inductive_loop", "radar", "microwave", "lidar", "magnetometer", "hybrid", "video", "Video", "Inductive Loop", "Radar", "Microwave", "Lidar", "Magnetometer", "Hybrid"}
VALID_RECALL_TYPES = {"None", "Min", "Max", "Soft", "none", "min", "max", "soft"}

COMPLETENESS_CATEGORIES = ["location", "approaches", "phases", "detection", "timing"]
CATEGORY_WEIGHT = 1.0 / len(COMPLETENESS_CATEGORIES)


@dataclass
class FileValidation:
    filename: str
    present: bool = False
    row_count: int = 0
    missing_headers: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)


@dataclass
class SignalScore:
    signal_id: str
    location: float = 0.0
    approaches: float = 0.0
    phases: float = 0.0
    detection: float = 0.0
    timing: float = 0.0

    @property
    def percent_complete(self) -> float:
        return round(
            (self.location + self.approaches + self.phases + self.detection + self.timing)
            * CATEGORY_WEIGHT
            * 100,
            1,
        )

    def summary(self) -> dict:
        return {
            "signal_id": self.signal_id,
            "percent_complete": self.percent_complete,
            "categories": {
                "location": self.location == 1.0,
                "approaches": self.approaches == 1.0,
                "phases": self.phases == 1.0,
                "detection": self.detection == 1.0,
                "timing": self.timing == 1.0,
            },
        }


def _parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text.strip()))
    return list(reader)


def _read_files_from_zip(zip_bytes: bytes) -> dict[str, str]:
    files = {}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for name in zf.namelist():
            if name.endswith(".txt"):
                files[name] = zf.read(name).decode("utf-8-sig")
    return files


def _read_files_from_dict(file_dict: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in file_dict.items() if k.endswith(".txt")}


def _validate_headers(rows: list[dict], expected: list[str], filename: str) -> list[str]:
    if not rows:
        return []
    actual = set(rows[0].keys())
    return [f for f in expected if f not in actual]


def _is_valid_coordinate(val: str) -> bool:
    try:
        f = float(val)
        return -180 <= f <= 180 and f != 0.0
    except (ValueError, TypeError):
        return False


def check_gtss(source) -> dict:
    """
    Main entry point. Accepts either:
      - bytes (ZIP file contents)
      - dict[str, str] mapping filenames to their text content
    Returns a full completeness report.
    """
    if isinstance(source, bytes):
        files = _read_files_from_zip(source)
    elif isinstance(source, dict):
        files = _read_files_from_dict(source)
    else:
        raise ValueError("source must be ZIP bytes or dict of {filename: text}")

    parsed = {}
    validations = {}

    for fname in REQUIRED_FILES:
        v = FileValidation(filename=fname)
        if fname in files:
            v.present = True
            rows = _parse_csv(files[fname])
            v.row_count = len(rows)
            parsed[fname] = rows
        else:
            v.present = False
            parsed[fname] = []
        validations[fname] = v

    expected_headers = {
        "agency.txt": AGENCY_FIELDS,
        "signals.txt": SIGNAL_FIELDS,
        "approaches.txt": APPROACH_FIELDS,
        "phases.txt": PHASE_FIELDS,
        "detectors.txt": DETECTOR_FIELDS,
        "basic_timings.txt": TIMING_FIELDS,
    }
    for fname, expected in expected_headers.items():
        if parsed[fname]:
            missing = _validate_headers(parsed[fname], expected, fname)
            validations[fname].missing_headers = missing
            if missing:
                validations[fname].errors.append(f"Missing columns: {', '.join(missing)}")

    # --- Validate agency ---
    agency_rows = parsed["agency.txt"]
    if not agency_rows:
        validations["agency.txt"].errors.append("No agency record found")
    else:
        a = agency_rows[0]
        for fld in ["agency_id", "agency_name", "agency_timezone"]:
            if not a.get(fld, "").strip():
                validations["agency.txt"].errors.append(f"Empty required field: {fld}")

    # --- Build signal index ---
    signals = parsed["signals.txt"]
    signal_ids = {row.get("signal_id", "").strip() for row in signals if row.get("signal_id", "").strip()}

    # --- Build lookup sets ---
    approaches_by_signal = {}
    for row in parsed["approaches.txt"]:
        sid = row.get("signal_id", "").strip()
        if sid:
            approaches_by_signal.setdefault(sid, []).append(row)

    phases_by_signal = {}
    for row in parsed["phases.txt"]:
        sid = row.get("signal_id", "").strip()
        if sid:
            phases_by_signal.setdefault(sid, []).append(row)

    detectors_by_signal = {}
    for row in parsed["detectors.txt"]:
        sid = row.get("signal_id", "").strip()
        if sid:
            detectors_by_signal.setdefault(sid, []).append(row)

    timings_by_signal = {}
    for row in parsed["basic_timings.txt"]:
        sid = row.get("signal_id", "").strip()
        if sid:
            timings_by_signal.setdefault(sid, []).append(row)

    # --- Validate individual rows ---
    for row in parsed["approaches.txt"]:
        sid = row.get("signal_id", "").strip()
        if sid and sid not in signal_ids:
            validations["approaches.txt"].warnings.append(
                f"approach {row.get('approach_id', '?')} references unknown signal_id '{sid}'"
            )
        bearing = row.get("compass_bearing", "").strip()
        if bearing:
            try:
                b = float(bearing)
                if not (0 <= b <= 360):
                    validations["approaches.txt"].warnings.append(
                        f"approach {row.get('approach_id', '?')} bearing {b} outside 0-360"
                    )
            except ValueError:
                validations["approaches.txt"].warnings.append(
                    f"approach {row.get('approach_id', '?')} non-numeric bearing '{bearing}'"
                )

    for row in parsed["phases.txt"]:
        mt = row.get("movement_type", "").strip()
        if mt and mt not in VALID_MOVEMENT_TYPES:
            validations["phases.txt"].warnings.append(
                f"signal {row.get('signal_id', '?')} phase {row.get('phase', '?')} unknown movement_type '{mt}'"
            )

    # --- Score each signal ---
    scores = {}
    for row in signals:
        sid = row.get("signal_id", "").strip()
        if not sid:
            continue

        score = SignalScore(signal_id=sid)

        lat = row.get("latitude", "").strip()
        lng = row.get("longitude", "").strip()
        if _is_valid_coordinate(lat) and _is_valid_coordinate(lng):
            score.location = 1.0

        if sid in approaches_by_signal and len(approaches_by_signal[sid]) > 0:
            score.approaches = 1.0

        if sid in phases_by_signal and len(phases_by_signal[sid]) > 0:
            score.phases = 1.0

        if sid in detectors_by_signal and len(detectors_by_signal[sid]) > 0:
            score.detection = 1.0

        if sid in timings_by_signal and len(timings_by_signal[sid]) > 0:
            score.timing = 1.0

        scores[sid] = score

    # --- Orphan checks ---
    for sid in approaches_by_signal:
        if sid not in signal_ids:
            validations["approaches.txt"].warnings.append(f"Approaches exist for unknown signal_id '{sid}'")
    for sid in phases_by_signal:
        if sid not in signal_ids:
            validations["phases.txt"].warnings.append(f"Phases exist for unknown signal_id '{sid}'")
    for sid in detectors_by_signal:
        if sid not in signal_ids:
            validations["detectors.txt"].warnings.append(f"Detectors exist for unknown signal_id '{sid}'")
    for sid in timings_by_signal:
        if sid not in signal_ids:
            validations["basic_timings.txt"].warnings.append(f"Timings exist for unknown signal_id '{sid}'")

    # --- Agency-level summary ---
    total_signals = len(scores)
    if total_signals > 0:
        agency_pct = round(sum(s.percent_complete for s in scores.values()) / total_signals, 1)
    else:
        agency_pct = 0.0

    complete_signals = sum(1 for s in scores.values() if s.percent_complete == 100.0)
    category_coverage = {}
    for cat in COMPLETENESS_CATEGORIES:
        count = sum(1 for s in scores.values() if getattr(s, cat) == 1.0)
        category_coverage[cat] = round(count / total_signals * 100, 1) if total_signals else 0.0

    signal_scores_sorted = sorted(scores.values(), key=lambda s: s.percent_complete)

    return {
        "agency": {
            "agency_id": agency_rows[0].get("agency_id", "") if agency_rows else "",
            "agency_name": agency_rows[0].get("agency_name", "") if agency_rows else "",
        },
        "overall_completeness_pct": agency_pct,
        "total_signals": total_signals,
        "complete_signals": complete_signals,
        "category_coverage": category_coverage,
        "file_validations": {
            fname: {
                "present": v.present,
                "row_count": v.row_count,
                "missing_headers": v.missing_headers,
                "errors": v.errors,
                "warnings": v.warnings[:20],
            }
            for fname, v in validations.items()
        },
        "signals": [s.summary() for s in signal_scores_sorted],
    }


def print_report(result: dict):
    """Pretty-print a completeness report to the console."""
    a = result["agency"]
    print(f"\n{'='*60}")
    print(f"  GTSS Completeness Report: {a['agency_name']} ({a['agency_id']})")
    print(f"{'='*60}")
    print(f"  Overall Completeness: {result['overall_completeness_pct']}%")
    print(f"  Total Signals: {result['total_signals']}")
    print(f"  Fully Complete: {result['complete_signals']}")
    print()

    print("  Category Coverage (% of signals with data):")
    for cat, pct in result["category_coverage"].items():
        bar = "#" * int(pct / 5) + "-" * (20 - int(pct / 5))
        print(f"    {cat:<12} [{bar}] {pct}%")
    print()

    fv = result["file_validations"]
    has_issues = any(fv[f]["errors"] or fv[f]["warnings"] or not fv[f]["present"] for f in fv)
    if has_issues:
        print("  File Validation Issues:")
        for fname, v in fv.items():
            if not v["present"]:
                print(f"    {fname}: MISSING")
            for e in v["errors"]:
                print(f"    {fname}: ERROR - {e}")
            for w in v["warnings"][:5]:
                print(f"    {fname}: WARN  - {w}")
            if len(v["warnings"]) > 5:
                print(f"    {fname}: ... and {len(v['warnings']) - 5} more warnings")
        print()

    print("  Signal Completeness:")
    print(f"  {'Signal ID':<12} {'%':>5}  {'Loc':>3} {'App':>3} {'Pha':>3} {'Det':>3} {'Tim':>3}")
    print(f"  {'-'*12} {'-'*5}  {'-'*3} {'-'*3} {'-'*3} {'-'*3} {'-'*3}")
    for s in result["signals"]:
        cats = s["categories"]
        loc = " Y " if cats["location"] else " - "
        app = " Y " if cats["approaches"] else " - "
        pha = " Y " if cats["phases"] else " - "
        det = " Y " if cats["detection"] else " - "
        tim = " Y " if cats["timing"] else " - "
        print(f"  {s['signal_id']:<12} {s['percent_complete']:>5.1f}  {loc}{app}{pha}{det}{tim}")

    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python gtss_checker.py <path-to-gtss.zip>")
        sys.exit(1)

    path = sys.argv[1]
    with open(path, "rb") as f:
        data = f.read()

    result = check_gtss(data)
    print_report(result)
