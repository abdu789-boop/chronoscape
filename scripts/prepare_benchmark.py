"""Prepare ignored browser QA pages using the preserved pre-UI-redesign tag."""
import argparse
from pathlib import Path
import re
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--repo", type=Path, default=ROOT, help="Git repository holding the pre-ui-redesign tag")
parser.add_argument("--output", type=Path, default=ROOT / "docs" / "qa", help="Generated QA directory")
args = parser.parse_args()

# Read before creating any output: a missing baseline should fail without leaving
# an apparently ready comparison against an unintended version.
html = subprocess.check_output(["git", "show", "pre-ui-redesign:docs/index.html"], cwd=args.repo, text=True)
html = html.replace("lib/d3.v7.min.js", "../lib/d3.v7.min.js").replace("'data/", "'../data/")
html = re.sub(r"const v = .*?;[^\n]*", "const v = ''; // QA: loading is outside the measurement.", html)
html = re.sub(r"\bdevicePixelRatio\b", "Math.min(devicePixelRatio, 2)", html)
html = html.replace("setYear(-450);", "setYear(-450); window.__baselineReady = true;")
adapter = """
<style>#hud,#controls,#hint,#timeline{display:none!important}</style>
<script type="module">
import { register, timedDraw } from './runner.js';
while (!window.__baselineReady) await new Promise(resolve => setTimeout(resolve, 50));
// Match the new viewport, projection, clipping and raster density. All historical
// fill, label, city, and Canvas drawing algorithms remain the tagged baseline.
setupProjection = () => {
  projection = d3.geoEqualEarth().fitExtent([[26,26],[W-26,H-26]], {type:'Sphere'});
  projection.scale(projection.scale()*zoomK).translate([W/2+panX,H/2+panY]);
  projection.clipExtent([[-4,-4],[W+4,H+4]]); path = d3.geoPath(projection,ctx);
};
zoomK=1; panX=panY=0; setupProjection();
register({ id:'baseline', years,
  year(year) { curYear=year; snapshot=polities.filter(p=>p.f<=year&&p.t>=year).sort((a,b)=>b.a-a.a); timedDraw(()=>render()); return snapshot.length; },
  camera(view) { zoomK=view.zoom; panX=view.panX; panY=view.panY; setupProjection(); timedDraw(()=>render()); return snapshot.length; }
});
</script>
"""
args.output.mkdir(parents=True, exist_ok=True)
for filename in ("benchmark.html", "runner.js", "redesign.html"):
    shutil.copyfile(ROOT / "tests" / "browser" / filename, args.output / filename)
(args.output / "baseline.generated.html").write_text(
    "<!-- Generated from pre-ui-redesign; regenerate with scripts/prepare_benchmark.py. -->\n" + html + adapter
)
print(f"Prepared renderer benchmark in {args.output}")
