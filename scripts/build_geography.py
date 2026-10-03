"""Build the optional terrain and river layers from Natural Earth (public domain).

Inputs, downloaded into data/raw/ by scripts/fetch_sources.sh:
    ne_50m_rivers_lake_centerlines.json   rivers, and river courses through lakes
    ne_50m_lakes.json                      lakes
    SR_50M.zip                             shaded relief, 10800 x 5400, plate carree

Outputs in docs/data/:
    rivers.json   rivers and river courses through lakes, and natural lakes,
                  simplified to about 1 km. Each feature keeps Natural Earth's
                  scale rank as "r" (lower = shown at smaller scales), so the
                  viewer can add detail as it zooms in.
    terrain.webp  the relief resampled to 8192 x 4096, plate carree, as lossy
                  WebP (about 1.5 MB; JPEG at the same quality is 2.2 MB). The
                  map reprojects it on the graphics card for both projections.

Reservoirs are left out: most are twentieth-century dams. Where a river runs
through one, its course through the reservoir is drawn instead.

The relief is re-centred so that level ground, which covers most of the raster,
is mid-grey (128), with its contrast doubled. Blended over the map, mid-grey
leaves the colour beneath unchanged, darker values shade slopes facing away
from the light and lighter values brighten slopes facing it.

These layers show present-day geography for reference: coastlines, lakes and
river courses have changed over the period the atlas covers.

    .venv/bin/python scripts/build_geography.py          # regenerate
    .venv/bin/python scripts/build_geography.py --check  # fail if outputs differ

WebP encoders differ slightly between library versions, so --check compares the
decoded relief with a small tolerance rather than byte for byte.
"""
import argparse
import io
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from shapely.geometry import mapping, shape
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "docs" / "data"
INPUTS = ("ne_50m_rivers_lake_centerlines.json", "ne_50m_lakes.json", "SR_50M.zip")
RIVER_CLASSES = {"River", "Lake Centerline"}
LAKE_CLASSES = {"Lake", "Alkaline Lake"}
SIMPLIFY_DEGREES = 0.01
SIZE = (8192, 4096)
GAIN = 2.0
WEBP_QUALITY = 75


def rounded(value):
    if isinstance(value, (list, tuple)):
        return [rounded(item) for item in value]
    return round(value, 3)


def collection(path, classes):
    with open(path, encoding="utf-8") as fh:
        source = json.load(fh)
    features = []
    for feature in source["features"]:
        properties = feature["properties"]
        if properties.get("featurecla") not in classes or not feature.get("geometry"):
            continue
        geometry = shape(feature["geometry"]).simplify(SIMPLIFY_DEGREES, preserve_topology=True)
        if geometry.is_empty:
            continue
        if geometry.geom_type == "Polygon":
            # d3's spherical convention: exterior rings clockwise.
            geometry = orient(geometry, sign=-1.0)
        geometry = mapping(geometry)
        features.append({"type": "Feature", "properties": {"r": int(properties["scalerank"])},
                         "geometry": {"type": geometry["type"], "coordinates": rounded(geometry["coordinates"])}})
    # Stable order: most important first, then by position.
    features.sort(key=lambda item: (item["properties"]["r"], json.dumps(item["geometry"]["coordinates"])[:80]))
    return {"type": "FeatureCollection", "features": features}


def rivers_bytes():
    data = {
        "rivers": collection(RAW / "ne_50m_rivers_lake_centerlines.json", RIVER_CLASSES),
        "lakes": collection(RAW / "ne_50m_lakes.json", LAKE_CLASSES),
    }
    return (json.dumps(data, separators=(",", ":")) + "\n").encode("utf-8"), data


def relief():
    """Return the published relief as an 8-bit array and the level-ground value."""
    Image.MAX_IMAGE_PIXELS = None
    with zipfile.ZipFile(RAW / "SR_50M.zip") as archive:
        source = np.asarray(Image.open(io.BytesIO(archive.read("SR_50M.tif"))).convert("L"))
    level = int(np.bincount(source.ravel(), minlength=256).argmax())
    shaded = np.clip(128 + (source.astype(np.float32) - level) * GAIN, 0, 255).round().astype(np.uint8)
    return np.asarray(Image.fromarray(shaded, "L").resize(SIZE, Image.LANCZOS)), level


def webp_bytes(array):
    buffer = io.BytesIO()
    Image.fromarray(array, "L").save(buffer, "WEBP", quality=WEBP_QUALITY, method=6)
    return buffer.getvalue()


def relief_matches(path, expected):
    """True when the published image decodes to the expected relief within tolerance."""
    if not path.exists():
        return False, "missing"
    published = np.asarray(Image.open(path).convert("L"), dtype=np.int16)
    if published.shape != expected.shape:
        return False, f"size {published.shape[::-1]}, expected {expected.shape[::-1]}"
    difference = np.abs(published - expected.astype(np.int16))
    mean, worst = float(difference.mean()), int(difference.max())
    return mean <= 0.6 and worst <= 24, f"mean difference {mean:.2f}, largest {worst}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="Fail when the published layers differ from a rebuild")
    arguments = parser.parse_args()
    missing = [name for name in INPUTS if not (RAW / name).exists()]
    if missing:
        parser.exit(1, f"Missing raw inputs: {', '.join(missing)}. Run scripts/fetch_sources.sh first.\n")
    rivers, data = rivers_bytes()
    shaded, level = relief()
    rivers_path, terrain_path = OUT / "rivers.json", OUT / "terrain.webp"
    rivers_current = rivers_path.exists() and rivers_path.read_bytes() == rivers
    # The reference for the tolerance check is the relief after one encoding round trip.
    encoded = webp_bytes(shaded)
    reference = np.asarray(Image.open(io.BytesIO(encoded)).convert("L"))
    terrain_current, detail = relief_matches(terrain_path, reference)
    if arguments.check:
        stale = [name for name, ok in (("rivers.json", rivers_current), (f"terrain.webp ({detail})", terrain_current)) if not ok]
        if stale:
            parser.exit(1, f"Out of date: {', '.join(stale)}. Run .venv/bin/python scripts/build_geography.py\n")
        print(f"geography: rivers.json current; terrain.webp within tolerance ({detail})")
        return
    written = []
    if not rivers_current:
        rivers_path.write_bytes(rivers); written.append("rivers.json")
    if not terrain_current:
        terrain_path.write_bytes(encoded); written.append("terrain.webp")
    print(f"geography: {len(data['rivers']['features'])} river lines, {len(data['lakes']['features'])} lakes; "
          f"level ground {level} -> 128; wrote {', '.join(written) or 'nothing (current)'}")
    print(f"  rivers.json: {rivers_path.stat().st_size:,} bytes; terrain.webp: {terrain_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
