"""Distribute population inside countries using the Anthromes 12K land-use grid.

Crediting a polity with a flat share of each country's *area* is badly wrong
where people are unevenly spread: the Ming held eastern China, roughly half the
area but nearly all the people, and Rome held the Nile rather than Egypt's
Western Desert. Anthromes classifies every 5-arc-minute cell by land use for 73
time slices from 10000 BCE, and those classes are themselves derived from HYDE's
population reconstruction — so they encode where people actually were.

Each country's published total is redistributed across its cells in proportion
to a per-class density weight. Only the ratios between classes matter, because
every country is renormalised to its own total, so absolute density errors
cancel out.

Anthromes 12K: Ellis et al., Harvard Dataverse doi:10.7910/DVN/G0QDNQ, CC0.
"""
import os
import re
import zipfile

import numpy as np
import pandas as pd
import shapely

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data/raw/anthromes")
CACHE = os.path.join(SRC, "_cache")
NCOL, NROW, CELL = 4320, 2160, 1.0 / 12.0
# Masking every 5-arc-minute cell for 12k polygons takes hours, so weights are
# summed into blocks of FACTOR². Total weight is preserved exactly; only the
# precision of a polygon's edge softens, which barely moves a whole-polity sum.
FACTOR = 4
NCOL_C, NROW_C, CELL_C = NCOL // FACTOR, NROW // FACTOR, CELL * FACTOR

# relative persons/km², from the published density ranges for each anthrome
WEIGHT = {11: 5000, 12: 500,                       # urban, mixed settlements
          21: 400, 22: 250, 23: 175, 24: 120,      # villages
          31: 60, 32: 30, 33: 6, 34: 0.5,          # croplands
          41: 25, 42: 4, 43: 0.4,                  # rangelands
          51: 25, 52: 4, 53: 0.4, 54: 1.0,         # woodlands, inhabited barren
          61: 0.02, 62: 0.02, 63: 0.0, 70: 0.0}    # wild, ice, water

_mem = {}


def available_years():
    if "years" not in _mem:
        ys = []
        for fn in os.listdir(SRC):
            m = re.match(r"(\d+)(BC|AD)_anthromes\.zip$", fn)
            if m:
                y = int(m.group(1)) * (-1 if m.group(2) == "BC" else 1)
                ys.append(y)
        _mem["years"] = sorted(ys)
    return _mem["years"]


def nearest_year(year):
    return min(available_years(), key=lambda y: abs(y - year))


def weights(year):
    """Weight grid for the anthromes slice nearest `year`."""
    y = nearest_year(year)
    if y in _mem:
        return _mem[y]
    os.makedirs(CACHE, exist_ok=True)
    npy = os.path.join(CACHE, f"w{y}_{FACTOR}.npy")
    if os.path.exists(npy):
        w = np.load(npy)
    else:
        tag = f"{abs(y)}{'BC' if y < 0 else 'AD'}"
        with zipfile.ZipFile(os.path.join(SRC, f"{tag}_anthromes.zip")) as z:
            name = [n for n in z.namelist() if n.endswith(".asc")][0]
            with z.open(name) as fh:
                cls = pd.read_csv(fh, skiprows=6, sep=r"\s+", header=None,
                                  dtype="int16").values
        full = np.zeros(cls.shape, dtype="float32")
        for code, wt in WEIGHT.items():
            if wt:
                full[cls == code] = wt
        w = full.reshape(NROW_C, FACTOR, NCOL_C, FACTOR).sum(axis=(1, 3))
        np.save(npy, w)
    for k in [k for k in _mem if isinstance(k, int)][:-1]:
        if len(_mem) > 6:
            _mem.pop(k, None)
    _mem[y] = w
    return w


def _window(bounds):
    """Grid index window covering a lon/lat bounding box."""
    x0, y0, x1, y1 = bounds
    c0 = max(0, int((x0 + 180) / CELL_C))
    c1 = min(NCOL_C, int(np.ceil((x1 + 180) / CELL_C)) + 1)
    r0 = max(0, int((90 - y1) / CELL_C))          # row 0 is the north edge
    r1 = min(NROW_C, int(np.ceil((90 - y0) / CELL_C)) + 1)
    return r0, r1, c0, c1


def _centers(r0, r1, c0, c1):
    lon = -180 + (np.arange(c0, c1) + 0.5) * CELL_C
    lat = 90 - (np.arange(r0, r1) + 0.5) * CELL_C
    return np.meshgrid(lon, lat)


def mask_of(geom, r0, r1, c0, c1):
    X, Y = _centers(r0, r1, c0, c1)
    return shapely.contains_xy(geom, X, Y)


def country_index(geoms):
    """Grid labelling each cell with the index of the country holding it."""
    if "cidx" in _mem:
        return _mem["cidx"]
    os.makedirs(CACHE, exist_ok=True)
    npy = os.path.join(CACHE, f"cidx_{len(geoms)}_{FACTOR}.npy")
    if os.path.exists(npy):
        idx = np.load(npy)
    else:
        idx = np.full((NROW_C, NCOL_C), -1, dtype="int16")
        for i, g in enumerate(geoms):
            r0, r1, c0, c1 = _window(g.bounds)
            if r1 <= r0 or c1 <= c0:
                continue
            m = mask_of(g, r0, r1, c0, c1)
            sub = idx[r0:r1, c0:c1]
            sub[m & (sub == -1)] = i
        np.save(npy, idx)
    _mem["cidx"] = idx
    return idx


def country_totals(year, n_countries, geoms):
    """Total weight inside each country for this slice — the normaliser."""
    key = ("tot", nearest_year(year), n_countries)
    if key in _mem:
        return _mem[key]
    w, idx = weights(year), country_index(geoms)
    valid = idx >= 0
    tot = np.bincount(idx[valid], weights=w[valid], minlength=n_countries)
    _mem[key] = tot
    return tot


def weight_by_country(geom, year, geoms):
    """The polity's share of each country's population weight.

    Returns (inside, totals) so a caller can price the same distribution at
    several years: land use is taken from the slice nearest `year`, while the
    country populations applied to it are year-specific.
    """
    n = len(geoms)
    r0, r1, c0, c1 = _window(geom.bounds)
    if r1 <= r0 or c1 <= c0:
        return np.zeros(n), country_totals(year, n, geoms)
    m = mask_of(geom, r0, r1, c0, c1)
    tot = country_totals(year, n, geoms)
    if not m.any():
        return np.zeros(n), tot
    w = weights(year)[r0:r1, c0:c1]
    idx = country_index(geoms)[r0:r1, c0:c1]
    sel = m & (idx >= 0)
    if not sel.any():
        return np.zeros(n), tot
    return np.bincount(idx[sel], weights=w[sel], minlength=n), tot


def population_from(inside, tot, year, pop_of_country):
    out = 0.0
    for i in np.nonzero(inside)[0]:
        if tot[i] > 0:
            out += pop_of_country(i, year) * (inside[i] / tot[i])
    return out


def polity_population(geom, year, geoms, pop_of_country):
    """Population of `geom` in `year`.

    For each country the polity touches: the country's population that year,
    times the polity's share of that country's *weight* rather than its area.
    """
    r0, r1, c0, c1 = _window(geom.bounds)
    if r1 <= r0 or c1 <= c0:
        return 0.0
    m = mask_of(geom, r0, r1, c0, c1)
    if not m.any():
        return 0.0
    w = weights(year)[r0:r1, c0:c1]
    idx = country_index(geoms)[r0:r1, c0:c1]
    sel = m & (idx >= 0)
    if not sel.any():
        return 0.0
    inside = np.bincount(idx[sel], weights=w[sel], minlength=len(geoms))
    tot = country_totals(year, len(geoms), geoms)
    hit = np.nonzero(inside)[0]
    out = 0.0
    for i in hit:
        if tot[i] > 0:
            out += pop_of_country(i, year) * (inside[i] / tot[i])
    return out
