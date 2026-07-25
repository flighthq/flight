---
package: '@flighthq/skeleton2d-formats'
crate: flighthq-skeleton2d-formats
draft: false
lastDirection: 2026-07-25
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# skeleton2d-formats — Charter

_**Decided [2026-07-25]: Option C** (formats now + animation binding; defer only the constraint solvers) — review + user. See the fork section and Decisions._

## What it is

The format-interop layer for 2D skeletal rigs: it maps third-party skeleton/animation files — **Spine** (`.json` and the `.skel` binary) and **DragonBones** (`.json`) — into Flight's internal `@flighthq/skeleton2d` data model (`Skeleton2D` bones, `Slot2D`, `RegionAttachment2D`/`MeshAttachment2D`, `Skin2D`) and, for animation, into `@flighthq/animation` `AnimationClip`s whose channels target `Bone2D` transforms. It is the `-formats` cell of the skeleton2d subject triad — the codec layer (`file → value`, registry-dispatched) — sitting between the runtime primitive (`@flighthq/skeleton2d`, which owns the bone/skin/pose math) and the consumers that play or draw those rigs. It ends where mapping ends: it parses descriptor files and reports diagnostics, but never propagates world transforms, deforms meshes, plays animation, or draws.

Distinct from its atlas sibling: `@flighthq/spritesheet-formats` already parses the libGDX/Spine **`.atlas`** (the texture-region half of a Spine export). skeleton2d-formats parses the **skeleton** half (the `.json`/`.skel` rig + animation), the file that references those atlas regions by name.

## North star

- **Codec, not consumer.** The job is faithful translation from an external skeleton file to the skeleton2d/animation data model. It never poses, deforms, plays, or draws — that line is the package's identity, and the test for any new surface is "is this still mapping?" (The per-frame *apply* of a parsed animation belongs in `@flighthq/skeleton2d`, not here — see the animation seam below.)
- **Registry by default.** Format dispatch is an open `Map` registry with last-write-wins and a vendor-prefix convention, so a caller importing one parser excludes the rest and a user can register a custom skeleton format. The canonical `-formats` shape; never a closed `switch(kind)`.
- **Tolerant, best-effort, honest about gaps.** Real rig files are large and feature-rich. Parsing returns best-effort skeleton data plus structured `ImportDiagnostic`s rather than throwing; `null` is reserved for the expected "unrecognized format" failure. Every recognized-but-unmodeled feature (IK / transform / path constraints, clipping / path / point attachments, events, bone `transformMode` edge cases beyond P1) emits an `ImportDiagnosticSeverity.Skip` crumb with a colocated dot-namespaced `kind` (`'spine.ik-constraint-unsupported'`, …), aggregated per-loop and reported once — so a consumer can see exactly what a rig used that Flight ignored.
- **Names mirror the source format.** Field and type names follow Spine/DragonBones' real vocabulary (bone/slot/skin/attachment/timeline) so a contributor reading the schema against the spec is not misled.
- **Spine bit-parity is validated HERE.** skeleton2d's three parent-decomposition inherit modes were implemented from first principles (correct semantics, unit-tested) with exact Spine-formula parity deliberately deferred (there was no real Spine corpus to hold it honest). This package is that checkpoint: importing real Spine rigs and comparing posed output is where any inherit-mode / deform edge case surfaces.

## Boundaries

**In scope:**
- Parse Spine `.json`, Spine `.skel` (binary), and DragonBones `.json` into `Skeleton2D` + slots + attachments + skins.
- Build `@flighthq/animation` `AnimationClip`s (bone-TRS + slot timelines) from the file's animations, with `Bone2D`-targeting `targetRef`s — Option C (animation lands now).
- Format auto-detection, an open registry seam for custom formats, and a tolerant `ImportDiagnostic` path.
- The cross-package types this layer needs, defined in `@flighthq/types` (one concept per file) — chiefly the animation-binding target (`Skeleton2DAnimationTarget`).

**Non-goals:**
- Posing / deforming / drawing — `@flighthq/skeleton2d` (runtime) + the display composition layer.
- Per-frame animation *apply* — a binder in `@flighthq/skeleton2d` (mirrors `@flighthq/scene3d`'s `applyAnimationClipToScene`), not here.
- The texture atlas — `@flighthq/spritesheet-formats` / `@flighthq/textureatlas` own `.atlas`.
- Serialize (skeleton → file). Import-first; export is a later question (Spine `.skel` write is rarely needed).

**Dependencies (anticipated):** `@flighthq/skeleton2d`, `@flighthq/types`, `@flighthq/importdiagnostics`; `@flighthq/animation` iff animation lands now. No renderer, no scene graph.

## Seam study (done — grounds the decisions above)

### Animation seam — and a correction to the premise

The `@flighthq/animation` core **currently visible in this clone** is a thin, target-free primitive set: `AnimationClip`/`AnimationChannel`/`AnimationTrack`, a keyframe sampler (`sampleAnimationClip` visitor / `sampleAnimationTrack`), an `AnimationPlayer` playhead (Repeat/PingPong), an `AnimationCrossfade` (two-player transition), and blend math (`accumulate`/`add`/`blend` samples). **Boundary note (review, 2026-07-25):** builder3's `AnimationBlendTree` / `AnimationStateMachine` / `AnimationLayerStack` are review2-passed and mergeable — they are simply not yet merged into this clone, so Spine's multi-track mixing **does** have a home coming. The consequence for this package is the same either way: skeleton2d-formats does **not** build a mixer, and the first demo needs only **single-clip playback**, which the thin core already provides — so this package is not blocked on that merge and builds against the core in-clone; the richer core lights up when the user merges builder3's arc.

The binding precedent is `@flighthq/scene3d`'s `applyAnimationClipToScene`: iterate `clip.channels`, cast `channel.targetRef` (typed `unknown`) to a domain target, `sampleAnimationTrack` into scratch, write to the target's transform fields, invalidate. There is **no 2D/bone binder yet**. The skeleton2d analogue — a `Skeleton2DAnimationTarget` (`{ boneIndex, path }` where `path` is `Translation | Rotation | Scale | Shear`, matching Spine/DragonBones' four bone-timeline kinds — the scene TRS vocabulary plus `Shear`, over `Bone2D` instead of a `SceneNode`) plus an `applyAnimationClipToSkeleton2D` binder — belongs in **`@flighthq/skeleton2d`** (the `Bone2D` owner), exactly as the 3D binder lives in scene not animation. `boneIndex` (not a `Bone2D` ref) keeps a clip stable across `cloneSkeleton2D`. skeleton2d-formats only *builds* the clip + targetRefs; the per-frame apply is the runtime's.

### Diagnostics seam

Production-ready and idiomatic — reuse `@flighthq/importdiagnostics`, no new package or convention. Thread a trailing `diagnostics?: ImportDiagnostic[]` sink through `parseSpine`/`parseDragonBones`; at each unmodeled-feature branch call `reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, 'spine.<feature>-unsupported', 'parseSpine', { count })`. The sink is opt-in-gated (a `undefined` check when absent — zero cost to the default parse), and hot per-timeline/per-keyframe validation aggregates offenders and reports once, per `agents/conventions/diagnostics.md`.

## The sequencing fork (DECIDED — Option C)

Spine/DragonBones rigs carry more than skeleton2d P1 models (P1 = bones + all inherit modes + region/mesh attachments + skins-as-setup + bind/palette + weighted/rigid deform; P1 does **not** have IK/transform/path constraints, animation binding, or skin *sets*). So: **what does the importer parse on its first landing, and does skeleton2d P2/P3 come before or after it?**

**Option A — formats NOW, static:** parse only what P1 supports (bones/slots/region+mesh/skins/setup-pose) and `Skip`-crumb everything else (animation, constraints, unmodeled attachments). Lands the importer and real assets immediately; validates the P1 runtime (the bit-parity checkpoint) against real Spine rigs now.
- _Demo-path cost:_ a Spine rig imported without animation is a **static setup pose**. The whole point of Spine/DragonBones is animated 2D characters — a still frame is not the compelling north-star example. It also `Skip`-crumbs the single most important feature (animation).

**Option B — skeleton2d P2/P3 FIRST, then formats:** build IK/transform/path constraints + skin sets + the animation binder in skeleton2d, THEN land formats parsing a complete feature set.
- _Demo-path cost:_ the runtime stays validated only by synthetic tests for another two arcs before any real file exposes edge cases; the largest delay before a real asset lands. But when formats does land, a full animated rig round-trips end to end.

**Option C — formats NOW + animation binding, defer only the constraint solvers (builder2's recommendation, review/user to confirm):** land formats parsing bones/slots/region+mesh/skins/setup-pose **and animation** (bone-TRS + slot timelines → `@flighthq/animation` clips), plus the small `Skeleton2DAnimationTarget` type + `applyAnimationClipToSkeleton2D` binder in skeleton2d. `Skip`-crumb only the genuinely-hard, genuinely-separable P2 features: IK/transform/path constraints, events, clipping/path/point attachments.
- _Why this is demo-optimal:_ the north-star example needs **animation, not constraints**. Animation binding is *small* (a scalar-channel binder mirroring the scene one, ~one file + one type; single-clip playback already exists) and is *separable* from the constraint solvers (a large fraction of real Spine animations are pure bone-TRS with no IK — or have IK baked). Option C therefore yields a **compelling animated demo with real assets in the next arc**, and moves the bit-parity checkpoint to real animated rigs, while leaving the heavy constraint math to a properly-scoped P2. It is Option A's "get real assets now" plus the one thing A's demo is missing, without B's full delay.

**DECIDED: Option C** (review + user, 2026-07-25). The recommendation was accepted.

## Decisions

- **[2026-07-25] Option C — formats now + animation binding; defer only the constraint solvers.** review + user. First landing parses bones/slots/region+mesh attachments/skins-as-setup + bone-TRS/slot **animation** timelines (→ `@flighthq/animation` clips with `Skeleton2DAnimationTarget` refs). Documented `Skip`-crumb deferrals: IK/transform/path **constraints**, **events**, and **clipping/path/point attachments** — recognized-but-unmodeled, each emitting an `ImportDiagnosticSeverity.Skip` crumb. The heavy constraint solvers are a properly-scoped skeleton2d P2, not blockers for the animated demo.
- **[2026-07-25] Build order (review-sequenced): binder → Spine `.json` → DragonBones.** (1) `applyAnimationClipToSkeleton2D` binder lands FIRST in `@flighthq/skeleton2d` (the target owner, mirroring scene's `applyAnimationClipToScene`) over the committed `Skeleton2DAnimationTarget` seam. (2) The Spine `.json` parser is the priority format (it drives the demo, and Spine JSON is human-writable → TDD with hand-authored minimal fixtures, no blind-binary-parse risk). (3) DragonBones after Spine. Spine `.skel` binary is a later pass behind the same registry.
- **[2026-07-25] No multi-track mixer here; single-clip playback for the first demo.** The core's mixing (builder3's blend-tree/state-machine/layer-stack) is out of this package's scope and merges via the boundary; skeleton2d-formats emits plain `AnimationClip`s a single `AnimationPlayer` plays.

## Open directions

1. **`.skel` binary vs `.json` first.** Spine `.json` is the tractable first parser; the `.skel` binary (varint/length-prefixed) is a second pass behind the same registry. DragonBones `.json` is close to Spine `.json` in shape.
2. **Skin sets (Spine "skins").** A Spine file's named skins (slot→attachment sets for character customization) are skeleton2d P3. Parsing them needs a `Skin*Set2D` type in skeleton2d first; under Option A/C the importer resolves the *default* skin's setup attachments and `Skip`-crumbs alternates until P3 lands.
3. **Export / round-trip.** Import-first. Whether to serialize back (and to which format) is a later question — Spine `.skel` write is niche; a Flight-native JSON round-trip may be the honest "round-trip fidelity" target instead.
4. **DragonBones specifics.** DragonBones uses a slightly different transform/slot model (e.g. its own `armature` container, `bone` vs `slot` split); confirm the mapping deltas when its parser is scoped.
