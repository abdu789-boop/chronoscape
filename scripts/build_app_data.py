"""Build the viewer's data files by running the source hierarchy.

Rather than resolving 500+ years independently, this resolves at the INTERVAL
level: tier-1 sources apply only inside narrow authority windows, so only the
intervals overlapping those windows need splitting and clipping. Everywhere
else the arbitration-corrected tier-2 skeleton passes through untouched.

Outputs (app/data/):
  polities.json  [{n name, f from, t to, a area_km2, s source, tier, g geometry}]
  years.json     sorted years where the map changes (the slider's snap targets)
  cities.json    Reba/Chandler-Modelski cities with population time series
"""
import json
import math
import os
import sys

import pandas as pd
from pyproj import Geod
from shapely.geometry import box, mapping, shape
from shapely.strtree import STRtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import resolve as R

ROOT = R.ROOT
RAW = os.path.join(ROOT, "data/raw")
OUT = os.path.join(ROOT, "app/data")
SIMPLIFY_DEG = 0.08          # ~9 km at the equator; this viewer is continental
COORD_DECIMALS = 3
GEOD = Geod(ellps="WGS84")


def area_km2(geom):
    """True geodesic area. Must be computed from RESOLVED geometry: a polity
    clipped against a tier-1 envelope is smaller than its source claims, and
    tier-1 features have no source area figure at all."""
    try:
        a, _ = GEOD.geometry_area_perimeter(geom)
        return abs(a) / 1e6
    except Exception:
        return 0.0


AMBIGUOUS_WD = set()


def find_ambiguous_wikidata(features):
    """Cliopatria reuses some Wikidata ids across unrelated polities: Q175881 is
    both the ancient Roman Republic and the 1799 revolutionary one, Q41137 is
    both Assyria and Syria, Q555994 is both Aq Qoyunlu and the Zhou-era state of
    Lu. Grouping on those ids fuses distinct states into one polity with an
    absurd lifespan, so we only trust an id that names exactly one polity."""
    seen = {}
    for f in features:
        p = f["properties"]
        if (p.get("Components") or "").strip() or not p.get("Wikidata"):
            continue
        seen.setdefault(p["Wikidata"], set()).add(R._norm(p["Name"]))
    bad = {k for k, v in seen.items() if len(v) > 1}
    print(f"  identity: {len(bad)} of {len(seen)} wikidata ids are ambiguous, "
          f"falling back to name for those")
    return bad


def identity(rec):
    """Same key the precedence engine matches on, so a polity's records group
    across sources and across renames - but only where the id is trustworthy."""
    if rec.wikidata and str(rec.wikidata) not in AMBIGUOUS_WD:
        return "wd:" + str(rec.wikidata)
    return "nm:" + R._norm(rec.name)


def round_coords(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], COORD_DECIMALS), round(c[1], COORD_DECIMALS)]
    return [round_coords(x) for x in c]


def build_polities():
    reg = R.load_registry()
    decisions = R.load_decisions()
    clio_src = next(s for s in reg["sources"] if s["id"] == "cliopatria")

    global AMBIGUOUS_WD
    AMBIGUOUS_WD = find_ambiguous_wikidata(R._cliopatria_features(reg, clio_src))

    # ---- tier 2, with arbitration applied -------------------------------
    records = []
    for f in R._cliopatria_features(reg, clio_src):
        p = f["properties"]
        rec = R.Record(
            name=p["Name"], from_year=p["FromYear"], to_year=p["ToYear"],
            geom=None, source_id="cliopatria", tier=2, grade=clio_src["grade"],
            wikidata=p.get("Wikidata"),
        )
        rec = R.apply_decisions(rec, p, decisions, "cliopatria")
        if rec is None:
            continue
        rec.geom = R.valid(shape(f["geometry"]))
        rec.unclipped = rec.geom          # succession is asked of real extent,
        rec.area_km2 = p.get("Area") or 0  # not of a precedence remnant
        records.append(rec)
    print(f"  tier2 after arbitration: {len(records)} records")

    # ---- tier 1 overrides, window by window ------------------------------
    tier1 = [s for s in reg["sources"]
             if s.get("tier") == 1 and s.get("role") == "extent"]
    for src in tier1:
        y0, y1 = src["authority"]["years"]
        mask = R.awmc_union_geom(reg, src)
        if mask is None or mask.is_empty:
            continue
        dom = src["authority"].get("bbox")
        if dom:
            mask = R.valid(mask.intersection(box(*dom)))
        ids = {"nm:" + R._norm(src["polity"])}
        if src.get("wikidata"):
            ids.add("wd:" + str(src["wikidata"]))

        kept, superseded, clipped = [], 0, 0
        for r in records:
            if r.to_year < y0 or r.from_year > y1 or not r.geom.intersects(mask):
                kept.append(r)
                continue
            # split the interval at the window edges
            spans = []
            if r.from_year < y0:
                spans.append((r.from_year, y0 - 1, False))
            spans.append((max(r.from_year, y0), min(r.to_year, y1), True))
            if r.to_year > y1:
                spans.append((y1 + 1, r.to_year, False))

            for a, b, inside in spans:
                if a > b:
                    continue
                if not inside:
                    kept.append(_copy(r, a, b, r.geom))
                    continue
                if R._identity_keys(r) & ids:
                    superseded += 1           # tier-1 replaces it outright
                    continue
                if getattr(r, "protected", False):
                    kept.append(_copy(r, a, b, r.geom))
                    continue
                g = R.valid(r.geom.difference(mask))
                if g is None or g.is_empty:
                    continue
                clipped += 1
                kept.append(_copy(r, a, b, g))

        t1 = R.Record(name=src["polity"], from_year=y0, to_year=y1, geom=mask,
                      source_id=src["id"], tier=1, grade=src["grade"],
                      wikidata=src.get("wikidata"))
        kept.append(t1)
        records = kept
        print(f"  {src['id']}: window {y0}..{y1}  superseded {superseded}, "
              f"clipped {clipped}")

    # ---- emit ------------------------------------------------------------
    feats, kept = [], []
    for r in records:
        g = r.geom.simplify(SIMPLIFY_DEG, preserve_topology=True)
        if g.is_empty:
            continue
        gj = mapping(g)
        if gj["type"] not in ("Polygon", "MultiPolygon"):
            continue
        gj = {"type": gj["type"], "coordinates": round_coords(gj["coordinates"])}
        r.k = identity(r)
        r.area = area_km2(r.geom)
        r.sgeom = g                      # simplified: enough for overlap stats
        u = getattr(r, "unclipped", r.geom)
        r.ugeom = (g if u is r.geom else
                   u.simplify(SIMPLIFY_DEG, preserve_topology=True))
        feats.append({
            "n": r.name, "f": int(r.from_year), "t": int(r.to_year),
            "a": int(r.area) if not math.isnan(r.area) else 0,
            "s": r.source_id, "tier": r.tier, "k": r.k, "g": gj,
        })
        kept.append(r)

    label_points(kept)
    for f, r in zip(feats, kept):
        f["lp"] = r.lp
    index = build_index(kept)
    add_succession(index, kept)
    add_modern_countries(index)
    for e in index.values():
        if isinstance(e, dict):
            for junk in ("_peak_geom",):
                e.pop(junk, None)
    with open(f"{OUT}/polity_index.json", "w") as fh:
        json.dump(index, fh, separators=(",", ":"))

    years = sorted({f["f"] for f in feats} | {f["t"] + 1 for f in feats})
    years = [y for y in years if -3400 <= y <= 2026]

    with open(f"{OUT}/polities.json", "w") as fh:
        json.dump(feats, fh, separators=(",", ":"))
    with open(f"{OUT}/years.json", "w") as fh:
        json.dump(years, fh)
    t1n = sum(1 for f in feats if f["tier"] == 1)
    print(f"polities: {len(feats)} features ({t1n} from tier 1), "
          f"{len(years)} snap years")


def _anchor(geom):
    c = geom.centroid
    if c.is_empty:
        c = geom.representative_point()
    return [round(c.x, 3), round(c.y, 3)]


def label_points(records):
    """Choose where each polity's name should sit.

    Anchoring to the largest piece is wrong for empires. From 1956 Britain's
    largest single piece is its Arabian holdings, not the British Isles, and
    France's largest is Algeria - so the label lands on a country that reads as
    someone else's. That happens for two different reasons, and both are handled:

      1. The piece is a stale colonial claim that an independent state is now
         drawn on top of (France still holding Algeria until 2023).
      2. The piece is legitimately held but is not the polity's home ground
         (Britain really did hold Aden and the Trucial States in 1960).

    So the anchor is, in order of preference: the piece containing the polity's
    home ground, taken from its smallest record; else the largest piece nobody
    else is sitting on; else the piece closest to home.
    """
    from shapely.ops import unary_union

    buckets = {}
    for r in records:
        buckets.setdefault(r.k, []).append(r)

    # A polity's core is its SMALLEST extent, not its earliest: the Fifth
    # Republic's first record (1958) already spans French West Africa, so
    # "earliest" would call Mali its heartland. Its smallest record is 2024 —
    # metropolitan France. Rome's smallest is the early Republic, i.e. Latium.
    home = {}
    for k, rs in buckets.items():
        peak = max(r.sgeom.area for r in rs)
        # 1%, not 5%: Portugal is only 4% of the Estado Novo's empire, so a
        # higher floor throws away the very record that identifies the homeland
        # and leaves only colony-bearing ones. 1% still rejects debris such as
        # the 6,892 km2 Cabinda record Cliopatria keeps until 2023.
        real = [r for r in rs if r.sgeom.area >= 0.01 * peak] or rs
        g = min(real, key=lambda r: r.sgeom.area).sgeom
        big = (max(g.geoms, key=lambda x: x.area)
               if g.geom_type == "MultiPolygon" else g)
        home[k] = big.representative_point()

    multi = sum(1 for r in records if r.sgeom.geom_type == "MultiPolygon")
    print(f"  label points: {multi} multi-part records to place")

    for r in records:
        g = r.sgeom
        if g.geom_type != "MultiPolygon":
            r.lp = _anchor(g)
            continue

        pieces = sorted(g.geoms, key=lambda x: -x.area)
        h = home.get(r.k)
        chosen = None

        # 1. the polity's own heartland, if it still holds it and it is big
        #    enough to carry a name
        if h is not None:
            for piece in pieces:
                if piece.contains(h) and piece.area >= 0.01 * pieces[0].area:
                    chosen = piece
                    break

        # 2. otherwise the largest piece that no one else occupies
        if chosen is None:
            others = [o for o in records
                      if o.k != r.k and o.from_year <= r.to_year
                      and o.to_year >= r.from_year
                      and o.sgeom.bounds[0] <= g.bounds[2]
                      and o.sgeom.bounds[2] >= g.bounds[0]
                      and o.sgeom.bounds[1] <= g.bounds[3]
                      and o.sgeom.bounds[3] >= g.bounds[1]]
            for piece in pieces[:5]:
                hits = []
                for o in others:
                    if o.sgeom.intersects(piece):
                        try:
                            hits.append(o.sgeom.intersection(piece))
                        except Exception:
                            pass
                covered = unary_union(hits).area / piece.area if hits else 0.0
                if covered < 0.5:
                    chosen = piece
                    break

        # 3. last resort: whatever lies nearest the heartland
        if chosen is None:
            chosen = (min(pieces, key=lambda x: x.distance(h)) if h is not None
                      else pieces[0])

        r.lp = _anchor(chosen)


def build_index(records):
    """Per-polity lifespan and peak extent, keyed by the same identity the
    precedence engine matches on."""
    span_lo = min(r.from_year for r in records)
    span_hi = max(r.to_year for r in records)
    index = {}
    for r in records:
        e = index.get(r.k)
        if e is None:
            e = index[r.k] = {"n": r.name, "first": r.from_year, "last": r.to_year,
                              "peak_year": r.from_year, "peak_area": r.area}
            e["_peak_geom"] = r.ugeom
        e["first"] = min(e["first"], r.from_year)
        e["last"] = max(e["last"], r.to_year)
        if r.area > e["peak_area"]:
            e["peak_area"] = r.area
            e["peak_year"] = r.from_year
            e["n"] = r.name              # name a polity by its largest record
            e["_peak_geom"] = r.ugeom
    for e in index.values():
        e["tstart"] = e["first"] <= span_lo
        e["tend"] = e["last"] >= span_hi
    index["_span"] = [span_lo, span_hi]
    print(f"index: {len(index) - 1} distinct polities "
          f"(dataset spans {span_lo}..{span_hi})")
    return index


def _overlaps(records, geom, year, exclude_k, floor=0.03, top=6):
    """Who occupies this ground in the given year, ranked by share of it."""
    if geom is None or geom.is_empty or geom.area == 0:
        return []
    bounds = geom.bounds
    best = {}
    for r in records:
        if r.from_year > year or r.to_year < year or r.k == exclude_k:
            continue
        b = r.ugeom.bounds
        if b[0] > bounds[2] or b[2] < bounds[0] or b[1] > bounds[3] or b[3] < bounds[1]:
            continue
        try:
            share = r.ugeom.intersection(geom).area / geom.area
        except Exception:
            continue
        if share > floor and share > best.get(r.name, 0):
            best[r.name] = share
    out = sorted(best.items(), key=lambda kv: -kv[1])[:top]
    return [[n, round(v * 100, 1)] for n, v in out]


def add_succession(index, records):
    """Predecessors and successors: who holds this polity's ground in the year
    before it appears and the year after it ends.

    Measured over its extent AT ITS HEIGHT, not at its first or last moment.
    A dying empire's final record is usually a rump, and asking who took the
    rump gives a true but useless answer - by that reading the Byzantine Empire
    is succeeded by Genoa, because its last holding was a Crimean remnant.
    Geometry is pre-clip for the same reason: a polity clipped against a tier-1
    envelope leaves a sliver nobody succeeds."""
    span_lo, span_hi = index["_span"]
    n = 0
    for k, e in index.items():
        if k == "_span":
            continue
        e["pred"] = ([] if e["first"] <= span_lo else
                     _overlaps(records, e["_peak_geom"], e["first"] - 1, k))
        e["succ"] = ([] if e["last"] >= span_hi else
                     _overlaps(records, e["_peak_geom"], e["last"] + 1, k))
        n += 1
    print(f"succession: computed for {n} polities")


def add_modern_countries(index):
    """Which present-day countries a polity covered at its greatest extent,
    ranked by how much ground it took in each."""
    path = os.path.join(RAW, "ne_50m_admin_0_countries.json")
    if not os.path.exists(path):
        print("modern countries: source missing, skipped")
        return
    with open(path) as fh:
        gj = json.load(fh)
    names, geoms = [], []
    for f in gj["features"]:
        nm = f["properties"].get("ADMIN") or f["properties"].get("NAME")
        if not nm or nm == "Antarctica" or not f.get("geometry"):
            continue
        g = R.valid(shape(f["geometry"])).simplify(0.05, preserve_topology=True)
        if g.is_empty:
            continue
        names.append(nm)
        geoms.append(g)
    tree = STRtree(geoms)

    for k, e in index.items():
        if k == "_span":
            continue
        g = e.get("_peak_geom")
        if g is None or g.is_empty:
            e["countries"] = []
            continue
        rows = []
        for i in tree.query(g):
            cg = geoms[i]
            try:
                inter = cg.intersection(g).area
            except Exception:
                continue
            if inter <= 0 or cg.area == 0:
                continue
            pct = 100 * inter / cg.area
            if pct >= 3:
                rows.append((names[i], round(pct), inter))
        rows.sort(key=lambda r: -r[2])          # biggest chunks of land first
        e["countries"] = [[n, p] for n, p, _ in rows[:14]]
    print("modern countries: done")


def _copy(rec, a, b, geom):
    new = R.Record(name=rec.name, from_year=a, to_year=b, geom=geom,
                   source_id=rec.source_id, tier=rec.tier, grade=rec.grade,
                   wikidata=rec.wikidata, arb=list(rec.arb))
    new.area_km2 = getattr(rec, "area_km2", 0)
    new.unclipped = getattr(rec, "unclipped", rec.geom)
    return new


def parse_year_col(col):
    if col.startswith("BC_"):
        return -int(col[3:])
    if col.startswith("AD_"):
        return int(col[3:])
    return None


def build_cities():
    frames = []
    for fname in ("chandlerV2.csv", "modelskiAncientV2.csv", "modelskiModernV2.csv"):
        df = pd.read_csv(f"{RAW}/reba/{fname}", encoding="latin-1", low_memory=False)
        df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce")
        df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce")
        frames.append(df)

    cities = {}
    for df in frames:
        year_cols = [(c, parse_year_col(c)) for c in df.columns]
        year_cols = [(c, y) for c, y in year_cols if y is not None]
        for _, r in df.iterrows():
            if pd.isna(r.get("Latitude")) or pd.isna(r.get("Longitude")):
                continue
            series = []
            for c, y in year_cols:
                v = pd.to_numeric(r[c], errors="coerce")
                if pd.notna(v) and v > 0:
                    series.append([y, int(v)])
            if not series:
                continue
            key = (str(r.City).strip().lower(), round(r.Latitude, 1), round(r.Longitude, 1))
            if key in cities:
                merged = {y: p for y, p in cities[key]["s"]}
                for y, p in series:
                    merged[y] = max(merged.get(y, 0), p)
                cities[key]["s"] = sorted(merged.items())
            else:
                cities[key] = {"n": str(r.City).strip(),
                               "la": round(float(r.Latitude), 3),
                               "lo": round(float(r.Longitude), 3),
                               "s": sorted(series)}

    out = list(cities.values())
    out.sort(key=lambda c: -max(p for _, p in c["s"]))
    with open(f"{OUT}/cities.json", "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"cities: {len(out)}")


if __name__ == "__main__":
    build_polities()
    if "--skip-cities" not in sys.argv:
        build_cities()
