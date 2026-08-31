#!/usr/bin/env bash
# Re-download every source dataset. They total ~1.5 GB and are deliberately not
# committed. Run from the repository root; safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw && cd data/raw

echo "==> Cliopatria (CC BY 4.0) — the global skeleton"
[ -d cliopatria ] || git clone --depth 1 https://github.com/Seshat-Global-History-Databank/cliopatria.git
( cd cliopatria && [ -f cliopatria_polities_only.geojson ] || unzip -o cliopatria.geojson.zip )

echo "==> AWMC / Barrington geodata (ODbL) — classical-world authority"
[ -d geodata ] || git clone --depth 1 https://github.com/AWMC/geodata.git

echo "==> historical-basemaps (GPL-3.0) — tier-3 cross-check only, never shipped"
[ -d historical-basemaps ] || git clone --depth 1 https://github.com/aourednik/historical-basemaps.git

echo "==> Pleiades (CC BY) — ancient places"
mkdir -p pleiades && cd pleiades
for f in pleiades-places-latest pleiades-names-latest; do
  [ -f "$f.csv" ] || { curl -sL -o "$f.csv.gz" "https://atlantides.org/downloads/pleiades/dumps/$f.csv.gz"; gunzip -f "$f.csv.gz"; }
done
cd ..

echo "==> Reba / Chandler / Modelski city populations (CC BY 4.0) — via figshare"
mkdir -p reba && cd reba
[ -f chandlerV2.csv ]        || curl -sL -o chandlerV2.csv        https://ndownloader.figshare.com/files/5407640
[ -f modelskiAncientV2.csv ] || curl -sL -o modelskiAncientV2.csv https://ndownloader.figshare.com/files/5356132
[ -f modelskiModernV2.csv ]  || curl -sL -o modelskiModernV2.csv  https://ndownloader.figshare.com/files/5407637
cd ..

echo "==> Natural Earth (public domain) — basemap and modern borders"
NE=https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master
[ -f ne_110m_land.json ]                     || curl -sL -o ne_110m_land.json                     $NE/110m/physical/ne_110m_land.json
[ -f ne_110m_admin_0_boundary_lines_land.json ] || curl -sL -o ne_110m_admin_0_boundary_lines_land.json $NE/110m/cultural/ne_110m_admin_0_boundary_lines_land.json
[ -f ne_50m_admin_0_countries.json ]         || curl -sL -o ne_50m_admin_0_countries.json         $NE/50m/cultural/ne_50m_admin_0_countries.json

echo "==> OWID long-run population (CC BY 4.0) — world totals and per-country"
[ -f owid_population_historical.csv ] || curl -sL -o owid_population_historical.csv \
  "https://ourworldindata.org/grapher/population.csv?v=1&csvType=full&useColumnShortNames=true"

echo
echo "Done. Now: python3 -m venv .venv && .venv/bin/pip install geopandas matplotlib pyogrio shapely pyyaml pandas pyproj"
echo "Then:     .venv/bin/python scripts/build_app_data.py"
