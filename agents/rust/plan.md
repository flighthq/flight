# Execution Plan

Status: **ACTIVE.** Phases 1–2 are done or under review. Phases 3–4 were dispatched 2026-10-21 (detail in the foreman expansion parcel; summary below). The user approved moving forward. Dispatch waits until principal's branch is merged, so that every agent sees these docs and the lint tooling.

Authoritative sources: `agents/design-decisions.md` (rulings D0–D8), `agents/ir-vocabulary.md` (the contract vocabulary), `agents/api-drift.md` (drift and negotiation lists), `AGENTS.md` (conventions and lint).

## Rules for every work package

1. **Translate, don't rewrite (D0).** Do not fix existing drift, in either direction, without a ruling. If a test or a TS signature looks wrong, escalate it rather than editing it.
2. **Gates.** Every parcel must pass:
   - `cargo test --workspace`
   - `cargo run -p cargo-flight-lint -- check --baseline agents/baselines/check.txt`, with no new violations
   - `cargo run -p cargo-flight-lint -- conform <ts-packages> --baseline agents/baselines/conform.txt`, with no new violations
   - `cargo run -p cargo-flight-lint -- manifest --check --crate <frozen crate>` for each frozen crate (currently only flight-geometry; an unscoped check fails on unfrozen crates)

   When work removes debt, regenerate the baseline so the ratchet tightens. Never regenerate to absorb new violations.
3. **Frozen manifests and tests are user-owned.** A manifest diff needs explicit user approval.
   - **Generated artifacts** in approved work packages may be committed by builders:
     - baselines regenerated after removing debt (the diff must contain deletions only);
     - the vocabulary table regenerated from `vocabulary`;
     - pre-approved manifest regenerations.
   - Other `agents/` prose is principal-owned.
   - TS reference: the snapshot archive at rev `a627849` was sent to every agent. Keep it outside repo/.
4. **Type ownership (D8): a type lives in the lowest crate that must name it.** Use the owner table in `agents/research/dissolve-types.md` and `agents/research/text-host-ownership.md`. If a type has no clear home, put it in `flight-unhomed` (below) instead of blocking.
5. **One crate per work package,** unless the package says otherwise. Shared-type changes go through principal.

## `flight-unhomed`: a holding crate for types with no home yet (user, 2026-10-21)

- It is temporary, so agents can move forward while the type's real home is factored out separately.
- **Depends only on the foundation crates** (entity, math, geometry, path, color). Anything that needs more than that must get a real home now.
- Every item carries `// flight-lint: allow(unhomed) <proposed owner or open question>`, so `allows --rule unhomed` lists the backlog. The rule will be added to the lint.
- It mirrors a TS `@flighthq/unhomed` package until it empties.

## Phases

### Phase 0: principal (in progress)
- Done: lint tooling, rulings, vocabulary, drift inventory, ownership research.
- Remaining: the user merges principal's branch. Then remaining decisions are resolved as they come up; nothing below blocks on them unless noted.

### Phase 1: foundation (1 work package, sequential)
- `flight-entity` gains the IR aliases: `Ref<T> = Arc<RwLock<T>>`, `Kind = String`, `AnySlot`, and the typed-array aliases `Float32Array = [f32]` etc.
- Create `flight-unhomed` (empty) and `flight-resource` (`ResourceResolutionState`).
- Update the lint so the vocabulary rows point at these real definitions.
- Geometry adopts `&Float32Array` for its 7 `*_from_float32_array` inputs. The manifest diff is pre-approved (signature alias only).

### Phase 2: pilot (2 work packages, parallel)
- `flight-color` and `flight-easing` brought to full compliance:
  - lint, conform and vocabulary clean, or every exception allow-marked with a reason;
  - tests mirror the TS `describe`/`it` names;
  - no baseline entries remain for the crate.
- Then the user reviews and freezes their manifests.
- Purpose: validate the gates and the review loop before scaling.

### Phase 3: remediate the existing crates (one work package per crate, in dependency order)
- Bring each of the existing ported crates to the rulings: D1 f64 declarations, D3 no map iteration, D5 hidden state removed, D6 sugar delegates, the vocabulary, and the D8 type placement.
- Array negotiation items and drift items are **not** fixed unilaterally. They are collected per crate for user decisions.

### Phase 4: port the remaining TS packages (in DAG order)
- About 130 packages, following the owner tables.
- New crates from D8: `textformat`, `meshgeometry` (renamed from mesh; the `Mesh` node moves to scene3d), `resource`, and the host-capability vocabulary crate (name pending).
- Renderer restructuring (backend state, slots) happens when render, scene2d and their backends are ported.

## Open decisions (they do not block Phases 1–2)
- Host-capability vocabulary crate: proposed `hostcapability`. The `Backend*Explanation` → `HostCapability*Explanation` rename is deferred.
- Integer and enum rows in the vocabulary.
- Errors (panic vs `Result`) and borrowed callbacks (`&dyn Fn`) vocabulary rows.
- The array negotiation list and the drift inventory.

## Phase 3–4 dispatch (2026-10-21)
- **WP9 first:** a consolidated type-owner table (`agents/research/type-owners.*`), reviewed by principal.
- **Phase 3:** remediate the existing crates, one package per builder, using the per-package checklist (D0–D14).
- **Phase 4:** port the remaining packages in dependency waves L0–L20, computed on the dissolved-types graph.
- **Principal design checkpoints:**
  - the node runtime type (before node, L7);
  - the native GL and wgpu render paths (before render, L11);
  - platform feature packages carry capability contracts only.

- **Final step (D21):** create `flight-sdk` (the public-lane re-export meta crate) after all waves land.

## Post-port design backlog (user, 2026-10-21; not in scope for this pass)
- **Buffer writers: position / length / stride.** Whether `write_*` / `*_from_*_array` functions take `offset`, `length`, `stride`.
  - Precedent: about 29 TS functions take `offset` / `stride`, e.g. `write_vector2_to_float32_array(out, offset, source)` and `convertPositionsZUpToYUp(values, stride, offset)`.
  - Rust subslices (`&mut buf[o..o + n]`) carry position and length for free, while TS `subarray()` allocates a view, so the targets differ.
  - Prefer positional `offset` / `stride` arguments over a range struct (which would need `create_*` under D12 / D23).
  - Survey (2026-10-21): 10 TS typed-array writers take `offset`; 89 do not.
    - Most of the 89 write **fixed-size values** (color matrices, tensors, kernels, support points), where offset adds little.
    - Candidates are the **bulk writers into buffers**: collision `writeAabbVertices` / `writeObbVertices`, `matrix4TransformVectors`, skeleton2d attachment vertices, `getTextureAtlasRegionUvQuad`, `writeCanvasScale9SpriteSlices`, `readGlRenderTargetPixels`, and easing samples. Several of these (vertices, UVs, easing curves baked into one texture) are natural `stride` cases too.
    - Note: with `offset` + `stride`, the count can no longer come from `out.len()`.
- **f64 intent aliases** (`PathCoordinate`, time, exact-integer) replacing the per-item `allow(f64)` markers.
- **Strip port-time allow markers** (`fix --strip-allows`); add `no-print`.
- **Panics and optional-out handling** designed alongside the transpiler.
