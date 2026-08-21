"""Render the vertical-slice region (Mediterranean + Near East) at test years,
with Cliopatria polity fills, AWMC authority outlines, and Pleiades settlements."""
import hashlib
import sys

import geopandas as gpd
import matplotlib.pyplot as plt
import pandas as pd
from shapely.geometry import box

RAW = "data/raw"
BBOX = (-12, 20, 65, 50)  # lon_min, lat_min, lon_max, lat_max

AWMC_OVERLAYS = {
    -550: ("persian_extent/extent_of_the_persian_empire.geojson", "AWMC: Persian empire extent"),
    -330: ("alexanders_empire/alexanders_empire.geojson", "AWMC: Alexander's empire"),
    117: ("roman_empire_ce_117_extent/roman_empire_ce_117_extent.geojson", "AWMC: Roman empire 117 CE"),
}


def polity_color(name: str) -> str:
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    palette = plt.get_cmap("tab20").colors + plt.get_cmap("tab20b").colors
    return palette[h % len(palette)]


def year_label(y: int) -> str:
    return f"{-y} BCE" if y < 0 else f"{y} CE"


def main():
    years = [int(a) for a in sys.argv[1:]] or [-550, -330, 117]
    view = box(*[BBOX[i] for i in (0, 1, 2, 3)])

    print("loading cliopatria...")
    clio = gpd.read_file(f"{RAW}/cliopatria/cliopatria_polities_only.geojson")
    print("loading shoreline...")
    shore = gpd.read_file(f"{RAW}/geodata/Physical Data/shoreline/shoreline.geojson")
    shore = shore.clip(view)

    print("loading pleiades...")
    pl = pd.read_csv(f"{RAW}/pleiades/pleiades-places-latest.csv", low_memory=False)
    pl = pl.dropna(subset=["reprLat", "reprLong", "minDate", "maxDate"])
    pl = pl[pl["featureTypes"].fillna("").str.contains("settlement")]
    pl = pl[(pl.reprLong > BBOX[0]) & (pl.reprLong < BBOX[2])
            & (pl.reprLat > BBOX[1]) & (pl.reprLat < BBOX[3])]

    for y in years:
        print(f"rendering {year_label(y)} ...")
        snap = clio[(clio.FromYear <= y) & (clio.ToYear >= y)]
        snap = snap[snap.geometry.intersects(view)].copy()
        snap["view_area"] = snap.geometry.clip(view).area

        fig, ax = plt.subplots(figsize=(16, 9), dpi=150)
        ax.set_facecolor("#cfe3ee")
        shore.plot(ax=ax, facecolor="#f4efe6", edgecolor="#9db4c0", linewidth=0.4, zorder=1)

        for _, r in snap.iterrows():
            gpd.GeoSeries([r.geometry]).plot(
                ax=ax, facecolor=polity_color(r.Name), edgecolor="#333333",
                linewidth=0.5, alpha=0.65, zorder=2)

        cities = pl[(pl.minDate <= y) & (pl.maxDate >= y)]
        ax.scatter(cities.reprLong, cities.reprLat, s=1.2, c="#00000055",
                   linewidths=0, zorder=4)

        if y in AWMC_OVERLAYS:
            path, label = AWMC_OVERLAYS[y]
            awmc = gpd.read_file(f"{RAW}/geodata/Cultural-Data/political_shading/{path}")
            awmc.boundary.plot(ax=ax, color="red", linewidth=1.6, linestyle="--", zorder=5)
            ax.plot([], [], "r--", label=label)

        for _, r in snap.nlargest(14, "view_area").iterrows():
            clipped = r.geometry.intersection(view)
            if clipped.is_empty:
                continue
            pt = clipped.representative_point()
            ax.annotate(r.Name, (pt.x, pt.y), ha="center", fontsize=8,
                        weight="bold", color="#1a1a1a", zorder=6)

        ax.set_xlim(BBOX[0], BBOX[2])
        ax.set_ylim(BBOX[1], BBOX[3])
        ax.set_title(f"Vertical slice — {year_label(y)} — Cliopatria fills, "
                     f"Pleiades settlements (dots), AWMC overlay (red dash)")
        ax.legend(loc="lower left")
        ax.set_axis_off()
        out = f"renders/slice_{y}.png"
        fig.savefig(out, bbox_inches="tight")
        plt.close(fig)
        print("  wrote", out, f"({len(snap)} polities, {len(cities)} settlements)")


if __name__ == "__main__":
    main()
