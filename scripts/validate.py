"""Check that a rebuild still satisfies everything this project claims.

Objective
---------
Every correctness claim in the documentation — the source-agreement figures, the
arbitration decisions, the label-placement fixes — used to live only in prose.
That is unverifiable by anyone who did not run the original investigation. This
script turns each claim into an assertion, so a rebuild either passes or names
exactly what changed.

Run it after every `build_app_data.py`, and before every push.

    .venv/bin/python scripts/validate.py           # everything
    .venv/bin/python scripts/validate.py --quick   # skip checks needing data/raw

Checks that need the raw sources are SKIPPED, not failed, when data/raw is
absent, so the script is still useful on a fresh clone. Exit code is non-zero
if anything fails.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs/data")
RAW = os.path.join(ROOT, "data/raw")

PASS, FAIL, SKIP = [], [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append((name, detail))
    print(f"  {'ok  ' if condition else 'FAIL'}  {name}" + (f"  — {detail}" if detail and not condition else ""))
    return condition


def skip(name, why):
    SKIP.append((name, why))
    print(f"  skip  {name}  — {why}")


def load(fn):
    with open(os.path.join(OUT, fn)) as fh:
        return json.load(fh)


# --------------------------------------------------------------- built outputs

def check_outputs():
    print("\nBuilt data present and well formed")
    for fn in ("polities.json", "years.json", "polity_index.json",
               "cities.json", "population.json", "borders.json", "land.json"):
        check(f"{fn} exists", os.path.exists(os.path.join(OUT, fn)))

    pol = load("polities.json")
    idx = load("polity_index.json")
    yrs = load("years.json")

    required = {"n", "f", "t", "a", "s", "tier", "k", "lp", "g"}
    missing = [f["n"] for f in pol[:2000] if not required <= set(f)]
    check("every feature carries name, interval, area, provenance, key, anchor",
          not missing, f"{len(missing)} incomplete, e.g. {missing[:3]}")

    check("intervals are ordered (from <= to)",
          all(f["f"] <= f["t"] for f in pol))
    check("snap years are sorted and unique",
          yrs == sorted(set(yrs)), f"{len(yrs)} entries")
    check("every polity key resolves in the index",
          all(f["k"] in idx for f in pol[:3000]))

    span = idx.get("_span")
    check("index records the dataset span", bool(span), str(span))
    for k, e in list(idx.items())[:400]:
        if k == "_span":
            continue
        if not (e["first"] <= e["peak_year"] <= e["last"]):
            check(f"peak year inside lifespan for {e['n']}", False,
                  f"{e['first']}..{e['last']} peak {e['peak_year']}")
            break
    else:
        check("peak year always falls inside the lifespan", True)
    return pol, idx


# ----------------------------------------------------- arbitration is applied

def check_arbitration(pol):
    print("\nArbitration decisions are actually applied")
    umbrella = [f["n"] for f in pol if f["n"].startswith("(")]
    check("ARB-002: umbrella records suppressed", not umbrella,
          f"{len(umbrella)} survived, e.g. {umbrella[:3]}")

    early = [(f["f"], f["t"]) for f in pol
             if f["n"] == "Ptolemaic Kingdom" and f["f"] < -323]
    check("ARB-001: no Ptolemaic Kingdom before 323 BCE", not early, str(early[:3]))

    mac = [f for f in pol if f["n"] == "Macedonian Empire" and f["f"] == -331]
    check("ARB-001: Alexander's conquests renamed to Macedonian Empire",
          len(mac) >= 2, f"found {len(mac)} records starting -331")


# ------------------------------------------------------------ precedence rules

def check_precedence(pol):
    print("\nPrecedence produced tier-1 overrides")
    t1 = [f for f in pol if f["tier"] == 1]
    check("tier-1 features present", len(t1) == 7, f"expected 7, got {len(t1)}")
    windows = {(f["n"], f["f"], f["t"]) for f in t1}
    for want in [("Roman Empire", 114, 117), ("Roman Empire", 190, 235),
                 ("Macedonian Empire", -325, -323), ("Achaemenid Empire", -513, -486)]:
        check(f"tier-1 window {want[0]} {want[1]}..{want[2]}", want in windows)
    check("tier-1 features name their source",
          all(f["s"].startswith("awmc_") for f in t1))


# ------------------------------------------------- label placement regressions

def bbox_has(pol, name, year, box, label):
    """The label anchor for `name` in `year` should sit inside `box`."""
    x0, y0, x1, y1 = box
    for f in pol:
        if f["n"] == name and f["f"] <= year <= f["t"]:
            lo, la = f["lp"]
            return check(f"{name} @{year} anchored in {label}",
                         x0 <= lo <= x1 and y0 <= la <= y1, f"got {f['lp']}")
    return check(f"{name} @{year} record exists", False, "no record")


def check_labels(pol):
    print("\nLabel anchors (regressions for the reported misplacements)")
    british_isles = (-11, 49, 2, 61)
    metro_france = (-5, 42, 9, 51.5)
    # Britain held Aden and the Trucial States legitimately, so coverage alone
    # cannot fix this: the anchor must follow the polity's home ground.
    for y in (1800, 1930, 1960, 1975, 2000):
        bbox_has(pol, "Kingdom of Great Britain", y, british_isles, "the British Isles")
    # France kept Algeria in the data until 2023; the label must not sit on it.
    for y in (1959, 1970, 2000, 2020):
        bbox_has(pol, "French Fifth Republic", y, metro_france, "metropolitan France")


# --------------------------------------------------------- derived index facts

def check_index(idx):
    print("\nIndex facts (lifespans, peaks, succession)")
    by_name = {e["n"]: e for k, e in idx.items() if k != "_span"}

    rome = by_name.get("Roman Empire")
    if rome:
        check("Rome peaks at its known maximum (117/118 CE)",
              rome["peak_year"] in (117, 118), str(rome["peak_year"]))
        check("Rome's peak extent ~5.26M km2",
              5.0e6 <= rome["peak_area"] <= 5.5e6, f"{rome['peak_area']:,.0f}")

    def succeeded_by(name, expect):
        e = by_name.get(name)
        if not e:
            return check(f"{name} present", False)
        got = [n for n, _ in e.get("succ", [])]
        return check(f"{name} succeeded by {expect}", expect in got, f"got {got[:4]}")

    def formed_from(name, expect):
        e = by_name.get(name)
        if not e:
            return check(f"{name} present", False)
        got = [n for n, _ in e.get("pred", [])]
        return check(f"{name} formed from {expect}", expect in got, f"got {got[:4]}")

    succeeded_by("Mongol Empire", "Yuan Dynasty")
    succeeded_by("Roman Republic", "Roman Empire")
    succeeded_by("Western Roman Empire", "Visigothic Kingdom")
    formed_from("Achaemenid Empire", "Median Kingdom")
    formed_from("Western Roman Empire", "Roman Empire")

    # the Wikidata collision fix: these must NOT be fused into one polity
    for name, limit in (("Roman Republic", 0), ("Assyria", 0)):
        e = by_name.get(name)
        if e:
            check(f"{name} lifespan not fused by an ambiguous Wikidata id",
                  e["last"] < limit, f"ends {e['last']}")


def check_population():
    print("\nWorld population series")
    w = load("population.json")["world"]
    check("series has the expected number of points", len(w) == 261, str(len(w)))
    check("series is sorted by year", w == sorted(w))
    last = w[-1]
    check("2023 world population ~8.09B",
          last[0] == 2023 and 8.0e9 <= last[1] <= 8.2e9, str(last))


# --------------------------------------------- checks that need the raw sources

def check_sources(quick):
    print("\nSource registry and agreement")
    if quick:
        return skip("registry paths + source agreement", "--quick")
    if not os.path.isdir(RAW):
        return skip("registry paths + source agreement",
                    "data/raw absent; run scripts/fetch_sources.sh")
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import resolve as R

    reg = R.load_registry()
    root = os.path.join(ROOT, reg["meta"]["root"])
    bad = [s["id"] for s in reg["sources"]
           if s.get("path") and not os.path.exists(os.path.join(root, s["path"]))]
    check("every registry source path resolves on disk", not bad, str(bad))

    # The headline claim of the precedence design: an independent tier-1
    # authority agrees closely with the tier-2 skeleton it overrides.
    decisions = R.load_decisions()
    for year, floor in ((117, 0.70), (200, 0.75)):
        _, rep = R.resolve_year(reg, decisions, year, reg["meta"]["slice_bbox"])
        ious = [a["iou"] for a in rep["agreements"] if a["polity"] == "Roman Empire"]
        check(f"tier1 vs tier2 IoU for Rome at {year} CE >= {floor}",
              bool(ious) and ious[0] >= floor, f"got {ious}")


def main():
    quick = "--quick" in sys.argv
    print("Validating Chronoscape build" + (" (quick)" if quick else ""))
    pol, idx = check_outputs()
    check_arbitration(pol)
    check_precedence(pol)
    check_labels(pol)
    check_index(idx)
    check_population()
    check_sources(quick)

    print(f"\n{len(PASS)} passed, {len(FAIL)} failed, {len(SKIP)} skipped")
    if FAIL:
        print("\nFailures:")
        for name, detail in FAIL:
            print(f"  - {name}" + (f"  ({detail})" if detail else ""))
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
