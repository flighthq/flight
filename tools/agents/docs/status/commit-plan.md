# Suggested commit plan — integration sync (2026-06-25)

The working tree is green: `npm run check` exits 0; suite **9708 / 9708** pass (the one unloadable file, `surface-rs/surfaceWasm.test.ts`, needs the gitignored wasm artifact built — see `integration.md`).

**Read before committing:**

- **Git is unavailable in this sandbox** (the worktree gitdir isn't mounted), so this plan is built from builder's exact `base→head` delta, not `git status`. Run these `git add` groups **on the host**, where git works.
- This state is **one green snapshot** (builder's full run + this sync). Commits below are grouped by theme for reviewability; because the changes are interdependent (e.g. the resources split repoints consumers across many packages), **intermediate commits are not individually guaranteed to `tsc`-compile — only the final tree is green.** If you want every commit green, squash 1–6 into one.
- Build artifacts are gitignored and must **not** be committed: `**/dist/**`, `**/src/wasm/**`, `*.tsbuildinfo`, `node_modules/`, `/incoming/`, `/tools/agents/docs/assignments/`.
- Commit convention: `type(scope): subject` (see `conventions/commits.md`). `!` flags a pre-1.0 break.

Suggested order (dependencies first):

---

## 1. `refactor(resources)!: split resources into audio/font/image/textureatlas/tileset/video`

Eliminates `@flighthq/resources`; its contents move to six focused leaf packages (and matching Rust crates). `textureatlas` depends on `image`; `tileset` depends on `textureatlas`. Consumers repoint to the new packages.

**Add:**

- `packages/audio/ packages/font/ packages/image/ packages/textureatlas/ packages/tileset/ packages/video/`
- `crates/flighthq-audio/ crates/flighthq-font/ crates/flighthq-image/ crates/flighthq-textureatlas/ crates/flighthq-tileset/ crates/flighthq-video/`
- `packages/resource-formats/` (consumes the new `image`)
- Consumer repoints (import `@flighthq/image` etc.): `packages/surface/ packages/spritesheet/ packages/media/ packages/sprite/ packages/texture/ packages/loader/ packages/spritesheet-formats/` and the SDK barrel `packages/sdk/src/index.ts` + `packages/sdk/package.json`

**Delete:** `packages/resources/` · `crates/flighthq-resources/`

> Note: the consumer files above also carry recovery changes (commit 4). If you keep commits separate, these files land here; that's fine — the split is the reason they changed.

---

## 2. `feat(types): reconstruct the dropped @flighthq/types header layer`

~94 type headers the curation pruned, rebuilt from consumer usage (backends, info structs, signal groups, kind constants).

**Add/modify:** `packages/types/src/` (117 files) **Delete:** `packages/types/src/DOMRenderOptions.ts` · `packages/types/src/DOMStageRectangle.ts`

---

## 3. `refactor(menu)!: reduce menu to the flat command shape`

`MenuItemTemplate` flattened; `MenuBackend` pulled down to host-electron's real 3-method seam; four orphan handle/event types removed. (Detail in `status/menu.md`.)

**Modify:** `packages/menu/` and the menu-related parts of `packages/host-electron/` (already covered in commit 4 if you don't split host-electron).

---

## 4. `feat: recover lost source across packages`

The big lost-source recovery (~201 functions across ~43 packages). Repo-wide, so **no scope**. Covers every other `packages/*` and `crates/flighthq-*` change not in commits 1–3 — e.g. `effects` (46), `surface` (34), `path` (32), `math` (30), `geometry` (24), `particles-formats` (26), `mesh` (20), `spritesheet` (18), `filters` (18), `displayobject*`, `render*`, `scene*`, `lighting`, `materials`, `textshaper`, `tween`, `velocity`, `webcam`, the platform suite, etc.

**Add/modify:** `packages/**` and `crates/**` not already staged in 1–3.

> Optional finer split: this can be broken per package-cluster (e.g. `feat(effects): …`, `feat(geometry): …`, `feat(rust/surface): …`) if you prefer many small commits. Use the per-package handoffs in `tools/agents/docs/status/<pkg>.md` for per-scope subjects.

---

## 5. `feat(camera): recover the 3D camera modules`

Picking/culling/depth/basis/frustum-corners/intersection (60 tests).

**Add/modify:** `packages/camera/` · `crates/flighthq-camera/`

---

## 6. `build(deps): update manifests, references, and lockfiles for the package split`

Workspace wiring for commits 1–5.

**Modify:** `tsconfig.base.json` · `tsconfig.build.json` · `Cargo.toml` · `Cargo.lock` · `package-lock.json` · `.prettierignore`

---

## 7. `docs(tools/agents): refresh the codebase map, package charters, and worker handoffs`

**Add/modify:** `tools/agents/docs/index.md`, `tools/agents/docs/packages/**`, `tools/agents/docs/status/**` (the per-package status docs, `integration.md`, `_QUESTIONS.md`), `AGENTS.md`, `ISSUE.md`

> `integration.md` and `_QUESTIONS.md`'s integration section are this sync's handoff. `ISSUE.md`, `status/_QUESTIONS.md`, and `status/menu.md` were reformatted (prettier whitespace only) to pass `format:check`.

---

## 8. `chore(tools/agents): ignore the whole agent-docs tree in eslint`

Broadens the lint ignore from `tools/agents/docs/assignments/**` to `tools/agents/docs/**` so docs and staging folders never break `npm run check`.

**Modify:** `eslint.config.ts`

> If you'd rather not separate this, fold it into commit 7.

---

## Not committed (gitignored — leave untracked)

`incoming/` (the review bundle, moved to `/tmp` after use) · `tools/agents/docs/assignments/` (inbound tray) · all `dist/`, `src/wasm/`, `*.tsbuildinfo`, `node_modules/`.

## Optional pre-commit sanity (on host)

`npm run check` (expect exit 0). To also green the surface-rs conformance test: `npm run install:rust && npm run build:wasm && npm run test --workspace=packages/surface-rs`.
