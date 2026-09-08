# Browser renderer benchmark

From the repository root, prepare the local QA pages and serve the site:

```sh
python3 scripts/prepare_benchmark.py
python3 -m http.server 8000 --directory docs
```

Open [the benchmark](http://localhost:8000/qa/benchmark.html), wait for both
renderers to load, and click **Run benchmark**. Keep the tab visible. Results
appear in the table, expandable JSON record, `window.__benchmarkResult`, and
the console. The harness sends nothing externally.

The preparation script reads the original viewer directly from the repository's
`pre-ui-redesign` Git tag and copies the three maintained harness sources into
`docs/qa/`. This output is ignored by Git and must not be deployed as part of
the product. `--repo` can specify a separate checkout holding that tag, and
`--output` can select a temporary output directory for preparation checks.

The comparison excludes loading, product controls, animation-frame waiting,
and GPU/browser paint. It measures real d3 geometry and Canvas draw submission
in the browser, with matched 1000 × 640 viewports, camera transforms, projection
fit, clipping, and raster density (DPR capped at 2). Original and redesigned
label policies intentionally remain different. Year preparation uses each
version's actual filtering/interpolation/caching behavior. Timings describe
these workloads, not universal speed or FPS. Repeat runs, report improvements
and regressions, and retain raw evidence alongside any performance claim.
