---
updated: 2026-08-12
by: manager
---

# WebGPU backlog — accumulated, deliberately deferred

> **Status: accumulating.** Every item here is confirmed against the tree at the commit named in its
> entry. This list exists because WGPU work is **deferred behind other work by standing decision**, not
> because these are low severity — several are render-visible and one is a silent total failure.
>
> Deferral is a scheduling choice. Nothing here is closed, dismissed, or downgraded. When WGPU work is
> scheduled, this is the queue, weakest-first is not the ordering — severity is, and it is stated per
> entry.

Cross-package by design: it spans `render-wgpu`, `scene3d-wgpu`, `scene2d-wgpu`, and `effects-wgpu`,
so it does not live in any one package cell. Each affected cell's `status.md` `## Open` carries a
one-line pointer here rather than a copy, so there is one source and it cannot drift.

## How to add an entry

State the evidence, not the conclusion. Every entry carries: what breaks, **what reaches it** (the
production path, or "no known path"), whether it is **render-visible**, **how it escaped** (which test
exists and what it actually asserts), and the **sibling** — GL is usually the correct one, and where it
is, the fix is largely already written.

An entry without a reaching path is a curiosity; an entry without an escape analysis will be
re-introduced by the next person.

## Open

### Silent total failure

- **Non-indexed geometry is never drawn.** `ensureWgpuMeshUpload` returns `null` when
  `geometry.indices === null` (`packages/scene3d-wgpu/src/wgpuMeshUpload.ts:20`), so
  `drawWgpuMeshSubset` issues no draw at all.
  **Reaches it:** valid glTF primitives may omit indices and the importer preserves that; AWD2 has an
  explicitly tested positions-only path. Real imported geometry disappears entirely.
  **Render-visible:** yes — WGPU only, and it renders *nothing* rather than something wrong, so a user
  is likely to read it as their own asset being broken.
  **Escape:** format tests stop at geometry construction; WGPU draw tests use indexed built-ins.
  Neither composes the contract. **Coverage cannot see this** — the null-indices arm *is* taken by a
  test, which asserts the buggy `null` return as correct (measured: `untested scene3d-wgpu` flags one
  arm in that file, at line 31, not line 20).
  **Sibling:** GL is correct — it uploads the vertex stream and calls `drawArrays` with the vertex
  count; `glMeshProgram.test` covers it.
  **Fix shape:** upload retains `vertexCount` without requiring an index buffer; `drawWgpuMeshSubset`
  issues a draw for non-indexed subsets. No API signature change expected.

### Render-visible, wrong output

- **Negative-determinant instances have inverted facing** (the WGPU half; the GL half is tracked with
  the main render work). `wgpuMeshPipeline.ts:166-167` hard-codes `frontFace: ccw` / `cullMode: back`
  with no determinant branch anywhere in the render tree, shadow passes included.
  **Reaches it:** glTF 2.0 specifies CW winding for negative global-transform determinant and sanctions
  negative scale as the mirroring mechanism; `gltfParse` preserves negative scale. Also reaches any
  native scene node with an odd number of negative scale axes.
  **Render-visible:** yes — a mirrored node has its intended exterior culled.
  **Escape:** importer transform tests and renderer cull tests each validate their own side; nothing
  composes negative determinant with facing. Every line involved already executes.
  **Fix shape (specified, not yet built):** `mirrored = det < 0` from the world matrix upper-3×3,
  computed once per visible mesh where the draw loop already calls `getNodeWorldMatrix4`. Because WGPU
  selects its immutable pipeline *before* the world matrix is populated, follow the existing
  orthogonal-run pattern: `mirrored` as a `DrawEntry` field and run discriminator,
  `runtime.activeMirroredRun` set before bind beside `activeSkinnedRun`/`activeBlendedRun`, folded into
  every pipeline cache key. That creates the CW variant **lazily, only on an actual mirrored run**, so
  unmirrored scenes pay nothing. Shadow cache identity extends to `(skinned, mirrored)`.
  **Trap:** do **not** skip facing selection for double-sided materials. Culling is off, but every lit
  shader family uses `@builtin(front_facing)` to negate the back-side geometric normal, so a wrong
  `frontFace` *mislights* mirrored double-sided meshes with nothing culled.

### Unexplained, recorded not chased

- **Seven webgpu-changed capture columns with no established cause**, carried over from the drift and
  recapture arc: `env-ibl`, `env-skybox`, `render-target-node-2d`, `material-custom-shader` (each closed
  on an exact WebGL edge but also moved on WebGPU, unexplained), plus `bitmap-smoothing`,
  `effect-bokeh-dof`, `node-blend-modes` (outside any bisect). Recorded in `unbacked-register.md` L28
  with evidence pointers.
  **"WebGPU matches baseline" is untested repo-wide** — 118 of 119 columns were never checked. That is
  a statement about where nobody looked, not a defect claim.

### Coverage surface, for whoever schedules a pass

- `scene3d-wgpu` carries **273 unexamined branch arms across 36 of 49 source files** (`untested
  scene3d-wgpu`, 2026-08-12). Substantially larger than the foundation tier ever held. This is a work
  queue, not a defect list — and per the entries above, the defects that matter here are *not* in it.

## Log

- **2026-08-12** — Created. WGPU work deferred behind other work by standing decision; the non-indexed
  draw defect was ruled priority-one on severity and then deferred under that decision, with the
  consequence stated rather than absorbed.
