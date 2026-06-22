# Packaging and Publishing

Packaging policy is enforced by `npm run packages:check`, not by memory or hand-tuned manifests. Treat this as orientation for the current package shape, not the source of truth — when policy changes, change the shared scripts and validation, not individual package manifests.

- Packages publish `dist` plus colocated source `*.test.ts` files. Tests ship intentionally, as examples and AI-readable documentation.
- Compiled test outputs are excluded from published packages.
- `prepack` cleans TypeScript build state, removes the package's `dist` via `clean:dist`, and rebuilds, so stale renamed files are never published.

## Package naming and axes

A package name is a subsystem, written as **one fused word** — even a two-word concept fuses, never taking an internal dash: `displayobject` (not `display-object`), `spritesheet`, `textinput`, `textlayout`, `textshaper`, `easing`, `loader`. The dash is reserved for **one axis of variation** — a derivative that depends on and specializes the base. There are two axes:

- **Backend / implementation** — `filters` → `filters-canvas` / `filters-css` / `filters-gl` / `filters-wgpu` / `filters-surface`; `displayobject` → `-canvas` / `-dom` / `-gl` / `-wgpu`; `textshaper` → `-canvas` / `-harfbuzz`; the host adapter `host-electron`.
- **Format support** — `<subsystem>-formats` = external file-format importers for that subsystem (`spritesheet-formats`, `particles-formats`). Any asset subsystem may grow one.

Rules:

- **One fused word per subsystem; a dash always marks an axis.** A multi-word subsystem fuses (`textinput`), matching `displayobject`/`spritesheet` — a dash that isn't a backend or `-formats` axis is misleading. If a package's suffix is not an axis of its prefix, it is its own subsystem with its own fused name: `easing` (not `tween-easing`), `loader` (not `resources-loader`). Plain-English clarity wins ties — fuse only what reads, and prefer the clearer single word over a prefix that pretends to be an axis.
- **Keep axes few and meaningful.** A package earns a dash-axis only when there is a real dimension with multiple swappable members. Do not invent one for a single companion.
- **A new top-level package is earned by a boundary** — a distinct dependency, independent reusability, or a backend — never by file count. Files scale freely within a package (a cohesive domain like `effects` is one package of many flat files, split only by backend); small packages at real boundaries are good and cost nothing under tree-shaking.
