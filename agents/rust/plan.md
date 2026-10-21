# Execution Plan

Status: **DRAFT (principal, 2026-10-21).** The user approved moving forward. Dispatch waits until principal's branch is merged, so that every agent sees these docs and the lint tooling.

Authoritative sources: `agents/design-decisions.md` (rulings D0–D8), `agents/ir-vocabulary.md` (the contract vocabulary), `agents/api-drift.md` (drift and negotiation lists), `AGENTS.md` (conventions and lint).

## Rules for every work package

1. **Translate, don't rewrite (D0).** Do not fix existing drift, in either direction, without a ruling. If a test or a TS signature looks wrong, escalate it rather than editing it.
2. **Gates.** Every parcel must pass:
   - `cargo test --workspace`
   - `cargo run -p cargo-flight-lint -- check --baseline agents/baselines/check.txt`, with no new violations
   - `cargo run -p cargo-flight-lint -- conform <ts-packages> --baseline agents/baselines/conform.txt`, with no new violations
   - `cargo run -p cargo-flight-lint -- manifest --check` for frozen crates

   When work removes debt, regenerate the baseline so the ratchet tightens. Never regenerate to absorb new violations.
3. **Frozen manifests and tests are user-owned.** A manifest diff needs explicit user approval.
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
