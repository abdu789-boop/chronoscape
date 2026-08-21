"""Precedence resolution engine.

Assembles the world at a given year out of the source hierarchy:

    tier 1  regional specialists  — authoritative in their declared window
    tier 2  global skeleton       — fills everywhere tier 1 is silent
    tier 3  tiebreak              — never drawn, only compared

Higher tiers clip lower ones. Sources are never clipped by their own tier:
a source's internal arrangement is its own business. Every output feature
carries the source that produced it, so provenance survives into the data
even though it is never shown on the map.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, field

import yaml
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "sources", "registry.yaml")
DECISIONS = os.path.join(ROOT, "arbitration", "decisions.jsonl")


@dataclass
class Record:
    name: str
    from_year: int
    to_year: int
    geom: object
    source_id: str
    tier: int
    grade: str
    wikidata: object = None
    role: str = "extent"
    arb: list = field(default_factory=list)
    original: object = None      # geometry before higher-tier clipping
    protected: bool = False      # exempt from tier-1 clipping (e.g. a sub-polity
                                 # sitting inside its parent's extent)


# --------------------------------------------------------------------------- io

def load_registry(path=REGISTRY):
    with open(path) as fh:
        return yaml.safe_load(fh)


def load_decisions(path=DECISIONS):
    out = []
    if not os.path.exists(path):
        return out
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#"):
                d = json.loads(line)
                if d.get("status", "active") == "active":
                    out.append(d)
    return out


def raw_path(reg, rel):
    return os.path.join(ROOT, reg["meta"]["root"], rel)


def valid(geom):
    if geom is None:
        return None
    if not geom.is_valid:
        geom = make_valid(geom)
    return geom


# ------------------------------------------------------------------- arbitration

def _scope_matches(scope, source_id, props):
    if scope.get("source") and scope["source"] != source_id:
        return False
    if scope.get("name") and scope["name"] != props.get("Name"):
        return False
    if scope.get("type") and scope["type"] != props.get("Type"):
        return False
    if "has_components" in scope:
        has = bool((props.get("Components") or "").strip())
        if has != scope["has_components"]:
            return False
    if scope.get("from_year_in") and props.get("FromYear") not in scope["from_year_in"]:
        return False
    yr = scope.get("years")
    if yr and not (yr[0] <= props.get("FromYear", 0) <= yr[1]):
        return False
    return True


def apply_decisions(rec, props, decisions, source_id):
    """Return the record with decisions applied, or None if suppressed."""
    for d in decisions:
        if not _scope_matches(d.get("scope", {}), source_id, props):
            continue
        act = d.get("action", {})
        kind = act.get("type")
        if kind == "suppress":
            return None
        if kind == "protect_from_clip":
            rec.protected = True
            rec.arb.append(d["id"])
            continue
        if kind == "rename":
            rec.name = act["to"]
            if act.get("wikidata"):
                rec.wikidata = act["wikidata"]
        elif kind == "retime":
            rec.from_year = act.get("from", rec.from_year)
            rec.to_year = act.get("to", rec.to_year)
        rec.arb.append(d["id"])
    return rec


# ----------------------------------------------------------------- source adapters

_cache = {}


def _cliopatria_features(reg, src):
    key = "clio"
    if key not in _cache:
        with open(raw_path(reg, src["path"])) as fh:
            _cache[key] = json.load(fh)["features"]
    return _cache[key]


def cliopatria_records(reg, src, year, decisions):
    out = []
    for f in _cliopatria_features(reg, src):
        p = f["properties"]
        if p["FromYear"] > year or p["ToYear"] < year:
            continue
        rec = Record(
            name=p["Name"], from_year=p["FromYear"], to_year=p["ToYear"],
            geom=None, source_id=src["id"], tier=src["tier"], grade=src["grade"],
            wikidata=p.get("Wikidata"), role="extent",
        )
        rec = apply_decisions(rec, p, decisions, src["id"])
        if rec is None:
            continue
        rec.geom = valid(shape(f["geometry"]))
        out.append(rec)
    return out


def awmc_union_geom(reg, src):
    key = "awmc:" + src["id"]
    if key not in _cache:
        with open(raw_path(reg, src["path"])) as fh:
            gj = json.load(fh)
        geoms = [valid(shape(f["geometry"])) for f in gj["features"]
                 if f.get("geometry")]
        geoms = [g for g in geoms if g is not None and not g.is_empty
                 and g.geom_type in ("Polygon", "MultiPolygon")]
        _cache[key] = valid(unary_union(geoms)) if geoms else None
    return _cache[key]


def awmc_records(reg, src, year, decisions):
    g = awmc_union_geom(reg, src)
    if g is None or g.is_empty:
        return []
    y0, y1 = src["authority"]["years"]
    return [Record(
        name=src["polity"], from_year=y0, to_year=y1, geom=g,
        source_id=src["id"], tier=src["tier"], grade=src["grade"],
        wikidata=src.get("wikidata"), role=src.get("role", "extent"),
    )]


def _histbasemap_years(reg, src):
    key = "hbm_index"
    if key not in _cache:
        d = raw_path(reg, src["path"])
        idx = {}
        for fn in os.listdir(d):
            m = re.match(r"world_(bc)?(\d+)\.geojson$", fn)
            if m:
                y = int(m.group(2)) * (-1 if m.group(1) else 1)
                idx[y] = os.path.join(d, fn)
        _cache[key] = idx
    return _cache[key]


def histbasemap_records(reg, src, year, decisions, tolerance=150):
    idx = _histbasemap_years(reg, src)
    if not idx:
        return []
    best = min(idx, key=lambda y: abs(y - year))
    if abs(best - year) > tolerance:
        return []
    key = "hbm:" + str(best)
    if key not in _cache:
        with open(idx[best]) as fh:
            _cache[key] = json.load(fh)["features"]
    out = []
    for f in _cache[key]:
        p = f.get("properties", {})
        name = p.get("NAME")
        if not name or not f.get("geometry"):
            continue
        out.append(Record(
            name=name, from_year=best, to_year=best,
            geom=valid(shape(f["geometry"])), source_id=src["id"],
            tier=src["tier"], grade=src["grade"], role="extent",
        ))
    return out


ADAPTERS = {
    "cliopatria": cliopatria_records,
    "awmc_union": awmc_records,
    "histbasemaps": histbasemap_records,
}


def records_for(reg, src, year, decisions):
    fn = ADAPTERS.get(src.get("format"))
    return fn(reg, src, year, decisions) if fn else []


def active_sources(reg, year, tiers=(1, 2, 3)):
    out = []
    for src in reg["sources"]:
        if src.get("tier") not in tiers:
            continue
        auth = src.get("authority") or {}
        y0, y1 = auth.get("years", [-10**9, 10**9])
        if y0 <= year <= y1 and src.get("role") in ("extent", None):
            out.append(src)
    return out


# --------------------------------------------------------------------- resolution

ALIASES_PATH = os.path.join(ROOT, "sources", "aliases.yaml")


def _load_aliases():
    if "aliases" not in _cache:
        table = {}
        if os.path.exists(ALIASES_PATH):
            with open(ALIASES_PATH) as fh:
                raw = yaml.safe_load(fh) or {}
            for canon, variants in raw.items():
                key = re.sub(r"[^a-z]", "", canon.lower())
                table[key] = key
                for v in variants or []:
                    table[re.sub(r"[^a-z]", "", v.lower())] = key
        _cache["aliases"] = table
    return _cache["aliases"]


def _norm(name):
    """Normalise a polity name, folding known cross-source variants together."""
    k = re.sub(r"[^a-z]", "", (name or "").lower())
    return _load_aliases().get(k, k)


def _iou(a, b):
    if a is None or b is None or a.is_empty or b.is_empty:
        return 0.0
    inter = a.intersection(b).area
    union = a.union(b).area
    return inter / union if union else 0.0


def _identity_keys(rec):
    keys = set()
    if rec.wikidata:
        keys.add("wd:" + str(rec.wikidata))
    keys.add("nm:" + _norm(rec.name))
    return keys


def resolve_year(reg, decisions, year, bbox=None):
    """Return (features, report) for one year."""
    view = box(*bbox) if bbox else None
    by_tier = {1: [], 2: [], 3: []}
    masks = []                      # tier-1 clip masks, bounded by their own domain

    for src in active_sources(reg, year):
        for rec in records_for(reg, src, year, decisions):
            if rec.geom is None or rec.geom.is_empty:
                continue
            if view is not None and not rec.geom.intersects(view):
                continue
            rec.original = rec.geom
            by_tier[src["tier"]].append(rec)
            if src["tier"] == 1:
                dom = src.get("authority", {}).get("bbox")
                masks.append(rec.geom.intersection(box(*dom)) if dom else rec.geom)

    claimed = valid(unary_union(masks)) if masks else None

    # A tier-2 record describing the SAME polity as a tier-1 record is superseded
    # outright: keeping the difference would leave a halo of the weaker source
    # around the stronger one. A DIFFERENT polity is merely clipped — it loses
    # the contested ground to the authority but keeps the rest.
    t1_ids = set()
    for r in by_tier[1]:
        t1_ids |= _identity_keys(r)

    superseded = []
    output = list(by_tier[1])
    for r in by_tier[2]:
        if _identity_keys(r) & t1_ids:
            superseded.append(r)
            continue
        if claimed is not None and not r.protected:
            try:
                r.geom = r.geom.difference(claimed)
            except Exception:
                r.geom = valid(r.geom).difference(claimed)
        if r.geom is not None and not r.geom.is_empty:
            output.append(r)

    report = _build_report(reg, year, by_tier, output, claimed, view, superseded)
    return output, report


def _build_report(reg, year, by_tier, output, claimed, view, superseded=()):
    agreements, displacements = [], []
    for t1 in by_tier[1]:
        for t2 in by_tier[2]:
            same = (t1.wikidata and t1.wikidata == t2.wikidata) or \
                   _norm(t1.name) == _norm(t2.name)
            if not same:
                continue
            agreements.append({
                "polity": t1.name,
                "tier1_source": t1.source_id,
                "iou": round(_iou(t1.original, t2.original), 4),
                "tier2_area_pct_of_tier1": round(
                    100 * t2.original.area / t1.original.area, 1) if t1.original.area else None,
            })

    sup_names = {r.name for r in superseded}
    for r in superseded:
        displacements.append({
            "polity": r.name, "pct_area_yielded_to_tier1": 100.0,
            "reason": "same polity as a tier-1 source; tier-1 geometry replaces it",
            "fully_superseded": True,
        })
    for r in by_tier[2]:
        if r.original is None or r.original.area == 0 or r.name in sup_names:
            continue
        lost = 1 - (r.geom.area / r.original.area if r.geom is not None and not r.geom.is_empty else 0)
        if lost > 0.001:
            displacements.append({
                "polity": r.name,
                "pct_area_yielded_to_tier1": round(100 * lost, 1),
                "reason": "neighbouring polity clipped against tier-1 border",
                "fully_superseded": r.geom is None or r.geom.is_empty,
            })
    displacements.sort(key=lambda d: -d["pct_area_yielded_to_tier1"])

    drawn = {_norm(r.name) for r in output}
    t3 = by_tier[3]
    only_t3 = sorted({r.name for r in t3 if _norm(r.name) not in drawn})
    only_out = sorted({r.name for r in output if _norm(r.name) not in {_norm(x.name) for x in t3}})

    coverage = None
    if view is not None:
        total = view.area
        drawn_geoms = [r.geom for r in output if r.geom is not None and not r.geom.is_empty]
        drawn_union = valid(unary_union(drawn_geoms)) if drawn_geoms else None
        claimed_in_view = drawn_union.intersection(view).area if drawn_union is not None else 0
        coverage = {
            "pct_of_view_under_a_polity": round(100 * claimed_in_view / total, 1),
            "pct_surveyed_but_empty": round(100 * (total - claimed_in_view) / total, 1),
            "note": "empty here means every covering source is silent, not that "
                    "the land was stateless; see arbitration/OPEN_QUESTIONS.md",
        }

    return {
        "year": year,
        "counts": {
            "tier1": len(by_tier[1]), "tier2": len(by_tier[2]),
            "tier3_consulted": len(t3), "drawn": len(output),
        },
        "agreements": sorted(agreements, key=lambda a: -a["iou"]),
        "displacements": displacements[:15],
        "tier3_disagreement": {
            "named_only_by_tier3": only_t3[:25],
            "named_only_by_drawn_result": only_out[:25],
        },
        "coverage": coverage,
    }


def to_geojson(records):
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "name": r.name, "wikidata": r.wikidata,
                "from": r.from_year, "to": r.to_year,
                "source": r.source_id, "tier": r.tier, "grade": r.grade,
                "arbitration": r.arb,
            },
            "geometry": mapping(r.geom),
        } for r in records],
    }


# ---------------------------------------------------------------------------- cli

def main():
    ap = argparse.ArgumentParser(description="resolve the world at a year")
    ap.add_argument("years", nargs="+", type=int)
    ap.add_argument("--bbox", nargs=4, type=float, default=None)
    ap.add_argument("--slice", action="store_true", help="use the slice bbox")
    ap.add_argument("--out", help="write resolved GeoJSON here (single year)")
    ap.add_argument("--report", help="write the full JSON report here")
    args = ap.parse_args()

    reg = load_registry()
    decisions = load_decisions()
    bbox = args.bbox or (reg["meta"]["slice_bbox"] if args.slice else None)

    reports = []
    for year in args.years:
        feats, rep = resolve_year(reg, decisions, year, bbox)
        reports.append(rep)
        label = f"{-year} BCE" if year < 0 else f"{year} CE"
        c = rep["counts"]
        print(f"\n=== {label} — drawn {c['drawn']}  (tier1 {c['tier1']}, "
              f"tier2 {c['tier2']}, tier3 consulted {c['tier3_consulted']})")
        for a in rep["agreements"]:
            print(f"    agree  {a['polity']:22} IoU {a['iou']:.3f}  "
                  f"vs {a['tier1_source']}  (tier2 is {a['tier2_area_pct_of_tier1']}% of tier1 area)")
        for d in rep["displacements"][:5]:
            why = d.get("reason", "")
            print(f"    yield  {d['polity']:22} {d['pct_area_yielded_to_tier1']:>5}%  {why}")
        if rep["coverage"]:
            print(f"    cover  {rep['coverage']['pct_of_view_under_a_polity']}% of view under a polity")
        t3 = rep["tier3_disagreement"]["named_only_by_tier3"]
        if t3:
            print(f"    tier3 names absent from result: {', '.join(t3[:8])}"
                  + (" ..." if len(t3) > 8 else ""))
        if args.out and len(args.years) == 1:
            with open(args.out, "w") as fh:
                json.dump(to_geojson(feats), fh)
            print(f"    wrote {args.out}")

    if args.report:
        with open(args.report, "w") as fh:
            json.dump(reports, fh, indent=2)
        print(f"\nreport -> {args.report}")


if __name__ == "__main__":
    main()
