# Breadth Review: Adjacent Content Use-Cases Beyond Games

_2026-07-13. Raw breadth analysis — which domains overlap Flight's existing coverage and what bedrock primitives are missing for authoritative reach into each._

## Domain Coverage

### Data Visualization (~80% built by accident)

Flight's existing packages cover most of what a data-viz layer needs: `camera2d` (pan/zoom), `intl` (tick label formatting), `spatial` (point locality), `interaction` (hover/selection), `tween` (animated transitions), `sprite` QuadBatch (scatter plot points), `math` statistics helpers.

**Missing bedrock:**

- **`color`** — color-space conversions (sRGB↔linear, HSL, OKLab, LCH), ramp/scheme generation, contrast computation. A pure value-leaf with no dependencies beyond `math` + `types`. Serves data-viz (sequential/diverging schemes), creative tools (color pickers), and motion graphics (compositing-correct blending). **Priority: now.**
- **`scale`** — d3-scale-tier mapping functions: linear, log, time, ordinal, band scales with ticks, nice(), and invert. Pure math, no DOM. The name collides with transform-scale vocabulary — **discuss** naming. **Priority: now.**

### Creative / Design Tools (strongest adjacent claim)

Flight already has: `path-boolean` CSG, `shape` hit-test registry, `snapshot` undo, `textinput`, full app shell (`application`, `flow`, platform suite). This is the domain where Flight's explicit-data-over-hidden-state philosophy has the most natural fit.

**Missing:**

- **`snapping`** — align/distribute/magnetism math for object placement. Pure geometry. **Priority: later.**
- **`history`** — command-stack undo/redo. Discuss overlap with `snapshot` (memento-style) and `textinput` (inline undo). A command-stack is complementary, not competing. **Priority: soon.**
- The fork-I **constraint/anchor** layer remains the open piece.

### Motion Graphics (mostly chartered)

The visual-authoring-artifact arc (`svg-formats`, `lottie-formats`, `rive-formats`) covers import. The genuinely missing piece:

- **`video-codec`** — WebCodecs mux/demux seam, mirror of `image-codec` for time-media. Serves motion graphics export, creative tools, and kiosk/signage. **Priority: soon.**

### Geo-Lite (needs scope ruling)

Geographic rendering has real overlap with Flight's renderer + tile infrastructure, but entering the domain requires a fork-G-style scope ruling before building anything.

If approved: `geo` (projections, haversine), `geo-formats` (GeoJSON/TopoJSON/MVT), `maptile` (slippy z/x/y math). **All: later, after ruling.**

### Presentations / E-Learning / Kiosk Signage

Zero new packages needed. These are pure depth + one example each as evidence that the application layer works end-to-end. The platform suite (`lifecycle`, `power`, `updater`) serves kiosk robustness; `textlayout` + `text-markup` serve slide content.

### AV / Music

- **`audio-formats`** — triad-predicted codec cell. Decode heavy-lifting is rust-intended. **Priority: soon.**
- Audio FFT/analysis — rust-intended.
- **`midi`** — reserve name only.

### Camera / Photo

- EXIF → `image-codec` deepening (not a new package).
- RAW decoding → rust-intended.
- Color management → the `color` cell above.

## Candidate Summary

| Candidate | Priority | Notes |
|-----------|----------|-------|
| `color` | now | Spaces, ramps, schemes, contrast. Pure value-leaf |
| `scale` | now | d3-scale tier. Naming discussion needed |
| `video-codec` | soon | WebCodecs mux/demux seam |
| `audio-formats` | soon | Triad-predicted. Rust-intended decode |
| `history` | soon | Command-stack undo. Discuss vs snapshot |
| `snapping` | later | Align/distribute/magnetism |
| `geo` / `geo-formats` / `maptile` | later | After scope ruling |
| `midi` | reserve | |
| `chart` | reserve-name-only | Assembly not bedrock |
| `schedule` | reserve-name-only | |

## Stressed Packages

Existing packages that gain new pressure from adjacent use-cases:

- **`textlayout` / `textshaper` / `text`** — axis labels need thousands of small measured strings with rotation and ellipsis.
- **`path` / `shape`** — stroke performance + polyline decimation gap (`simplifyPath` is self-intersection resolution, NOT Douglas-Peucker).
- **`sprite` QuadBatch** — 100k scatter points need per-instance tint everywhere (currently gl/wgpu-only).
- **`interaction` + `spatial`** — hover recipes for dense data.
- **`intl`** — tick formatting.
- **`camera2d`** — axis-locked zoom.
- **`snapshot`** — undo cost per keystroke (structural sharing?).
- **`surface`** — photo-editing depth.
- **gl/wgpu blend modes** — gate motion graphics more than any new package.
- **`accessibility`** — charts and kiosks.
- **`updater` / `power` / `lifecycle`** — kiosk robustness.

## Strategic Notes

- **Charting is the cheapest authoritative-in-new-domain purchase** — two small pure-math cells (`color`, `scale`) unlock the domain.
- Codec symmetry extends to time media — `video-codec` / `audio-formats`; encode is the differentiator.
- The creative-tool runtime is Flight's strongest positioning claim outside games.
- Geo needs one scope ruling before any work.
- Presentations/kiosk prove the app layer with examples only — no new packages.
