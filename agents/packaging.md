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

## Snapshot ("edge"/"next") channel

Every push to a release branch also publishes a **snapshot** build to npm — the continuous counterpart to the tagged stable release, so consumers can track the tip without waiting for a version bump. It reuses the same `version:packages` + `publish-packages.ts` machinery; only the version string and the dist-tag differ, so `latest` is never touched.

- **`scripts/edge-version.ts`** computes the snapshot version and channel and prints them as GitHub `$GITHUB_OUTPUT` `key=value` lines. The base is `@flighthq/sdk`'s current source version (tag-independent, so a missing release tag never yields a stale base), **bumped by the highest [conventional-commits](https://www.conventionalcommits.org) level among the commits since the last version tag** — a `type!:` subject or `BREAKING CHANGE:` footer is breaking, a `feat:` is a feature, anything else is a fix — so the snapshot sorts *above* the last release as its upcoming version. Which digit moves depends on the lane, keyed on the base major: **pre-1.0 (major `0`) is the ZeroVer lane** where everything shifts down one (breaking → minor, feature/fix → patch, major stays `0`); once a real `1.0.0` lands the **normal lane** applies (breaking → major, feature → minor, fix → patch) with no code change. The full string is `<bumped>-<channel>.<count>.<sha>`, where `<count>` = commits since the last version tag (`git rev-list --count <tag>..HEAD`, resetting each release so it reads as "Nth build toward the next version"; falls back to the total commit count before the first tag) — monotonic within a release cycle, so snapshots sort in commit order and are the real sort key — and `<sha>` is the short commit sha (disambiguation only). Channel: `main → edge`, `develop → next`. Because the count is measured from the last version tag, that tag must be pushed to the remote for CI to reset the counter; without it, CI counts from the previous tag (a larger but still-monotonic number).
- **`publish-packages.ts --tag <dist-tag>`** publishes under that dist-tag instead of `latest`. Everything else (build once, pin internal `"*"` deps temporarily, idempotent skip of already-published versions, provenance) is identical to the stable release.
- **`.github/workflows/tests.yml` → `edge-publish` job** runs only on `push` to `main`/`develop` (never on `pull_request` — forks have no secrets and only landed code should publish). Edge is meant to be *available*, so it gates only on the correctness legs — `build` (compiles) and `test-fast` (the merged unit-test run, seconds not minutes) — and **not** on the thorough per-package `test` leg or the health/hygiene legs (`size`, the flaky `render-test` matrix, `harness-build`, `quality`), which still run as parallel signals but never block a snapshot. (The thorough `test` leg runs each package under its correct `node`/`jsdom` environment with process isolation; it gates PRs, so environment-specific regressions are caught before merge, while `test-fast` runs the same files in one shared jsdom env for speed.) It computes the version, stamps it with `version:packages`, builds, and runs `npm run release -- --no-build --tag <channel>` authed with `NPM_TOKEN` + provenance.

Install a snapshot with `npm install @flighthq/sdk@edge` (or `@next`). Snapshots are prereleases, so a normal `^`/`x` range never resolves to one — they are opt-in by dist-tag only.

## Package naming and axes

A package name is a subsystem, written as **one fused word** — even a two-word concept fuses, never taking an internal dash: `displayobject` (not `display-object`), `spritesheet`, `textinput`, `textlayout`, `textshaper`, `easing`, `loader`. The dash is reserved for **one axis of variation** — a derivative that depends on and specializes the base. There are two axes:

- **Backend / implementation** — `effects` → `effects-gl` / `effects-wgpu` / `effects-canvas`; `displayobject` → `-canvas` / `-dom` / `-gl` / `-wgpu`; `textshaper` → `-canvas` / `-harfbuzz`; the host adapter `host-electron`.
- **Format support** — `<subsystem>-formats` = external file-format importers for that subsystem (`spritesheet-formats`, `particles-formats`). Any asset subsystem may grow one.

Rules:

- **One fused word per subsystem; a dash always marks an axis.** A multi-word subsystem fuses (`textinput`), matching `displayobject`/`spritesheet` — a dash that isn't a backend or `-formats` axis is misleading. If a package's suffix is not an axis of its prefix, it is its own subsystem with its own fused name: `easing` (not `tween-easing`), `loader` (not `resources-loader`). Plain-English clarity wins ties — fuse only what reads, and prefer the clearer single word over a prefix that pretends to be an axis.
- **Keep axes few and meaningful.** A package earns a dash-axis only when there is a real dimension with multiple swappable members. Do not invent one for a single companion.
- **A new top-level package is earned by a boundary** — a distinct dependency, independent reusability, or a backend — never by file count. Files scale freely within a package (a cohesive domain like `effects` is one package of many flat files, split only by backend); small packages at real boundaries are good and cost nothing under tree-shaking.
