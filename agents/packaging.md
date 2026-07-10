# Packaging and Publishing

Packaging policy is enforced by `npm run packages:check`, not by memory or hand-tuned manifests. Treat this as orientation for the current package shape, not the source of truth — when policy changes, change the shared scripts and validation, not individual package manifests.

- Packages publish `dist` plus colocated source `*.test.ts` files. Tests ship intentionally, as examples and AI-readable documentation.
- Compiled test outputs are excluded from published packages.
- `prepack` cleans TypeScript build state, removes the package's `dist` via `clean:dist`, and rebuilds, so stale renamed files are never published.

## Publishing to npm

The whole `@flighthq/*` graph publishes to public npm under **locked versioning** — every package shares one version, so `@flighthq/sdk@X` implies its entire dependency graph at `X`. Two scripts and one workflow drive it:

- `npm run version:packages <version>` — sets every `packages/*` manifest to one version (the locked bump). Run before tagging.
- `npm run release` (`scripts/publish-packages.ts`) — builds the graph once, then publishes each package with `--access public --ignore-scripts`. Idempotent: a version already on the registry is skipped, so a re-run after a partial failure completes the set. `--dry-run` packs and reports without uploading; a bare name-substring arg limits to matching packages.
- `.github/workflows/release.yml` — on a pushed `v*.*.*` tag, runs `npm ci && npm run build && npm run release` (authenticating with the `NPM_TOKEN` secret, attaching npm provenance), then builds the examples site at that tag and attaches `examples-dist-<tag>.tgz` as a GitHub release asset. The examples build is source-built but published-faithful: at the release commit the workspace source *is* the version just published. The separate site repo downloads that asset to serve `flighthq.ai/examples` (and flight-reference's own release asset for `/reference/`).

**The `"*"` → version pin.** `packages:check` enforces that internal `@flighthq/*` deps are `"*"` in source (the workspace-sibling marker; a real range would be fiction in a repo whose versions are a publish artifact, not a source fact). A published manifest must not carry `"*"` — a consumer of `@flighthq/sdk@0.1.0` whose deps say `"*"` would float them to `latest` and break when `0.2.0` ships. So `publish-packages.ts` rewrites each internal `"*"` to the exact sibling version in a **temporary** manifest edit, publishes, then restores `"*"` — the working tree stays `packages:check`-clean. This is the npm-native equivalent of pnpm's `workspace:*` protocol; do not commit pinned internal versions.

Release flow: `npm run version:packages 0.1.1` → commit → `git tag 0.1.1` → `git push --tags` (bare numeric tags, no `v` prefix — the `release.yml` trigger and the release-asset names follow the tag). Publishing requires the `@flighthq` npm scope and an `NPM_TOKEN` repo secret.

## Package naming and axes

A package name is a subsystem, written as **one fused word** — even a two-word concept fuses, never taking an internal dash: `displayobject` (not `display-object`), `spritesheet`, `textinput`, `textlayout`, `textshaper`, `easing`, `loader`. The dash is reserved for **one axis of variation** — a derivative that depends on and specializes the base. There are two axes:

- **Backend / implementation** — `filters` → `filters-canvas` / `filters-css` / `filters-gl` / `filters-wgpu` / `filters-surface`; `displayobject` → `-canvas` / `-dom` / `-gl` / `-wgpu`; `textshaper` → `-canvas` / `-harfbuzz`; the host adapter `host-electron`.
- **Format support** — `<subsystem>-formats` = external file-format importers for that subsystem (`spritesheet-formats`, `particles-formats`). Any asset subsystem may grow one.

Rules:

- **One fused word per subsystem; a dash always marks an axis.** A multi-word subsystem fuses (`textinput`), matching `displayobject`/`spritesheet` — a dash that isn't a backend or `-formats` axis is misleading. If a package's suffix is not an axis of its prefix, it is its own subsystem with its own fused name: `easing` (not `tween-easing`), `loader` (not `resources-loader`). Plain-English clarity wins ties — fuse only what reads, and prefer the clearer single word over a prefix that pretends to be an axis.
- **Keep axes few and meaningful.** A package earns a dash-axis only when there is a real dimension with multiple swappable members. Do not invent one for a single companion.
- **A new top-level package is earned by a boundary** — a distinct dependency, independent reusability, or a backend — never by file count. Files scale freely within a package (a cohesive domain like `effects` is one package of many flat files, split only by backend); small packages at real boundaries are good and cost nothing under tree-shaking.
