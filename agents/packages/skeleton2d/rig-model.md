---
package: '@flighthq/skeleton2d'
updated: 2026-08-04
---

# skeleton2d — rig model

Four rules that decide how this package is shaped. Each was settled while building, and each cost real
rework or a measurement to establish — they are recorded here because until now they existed only in
commit messages and coordination parcels, which is where knowledge goes to become the next stale brief.

Read this before adding a registry to this package, adding a deformer, writing an importer that produces
skinned geometry, or proposing that anything in here move to a package of its own.

**Pinning convention.** Every claim about what the tree currently contains names a SHA and a path, so a
reader can check it rather than trust it. A claim without one is a claim about intent, not about code.

## 1. Two registries, opposite defaults, and the rule that decides which

This package carries two registries and they behave differently on purpose. Reading one and assuming the
other matches will produce a bug that only shows up as something silently not happening.

**Animation target binders are PRELOADED** — `packages/skeleton2d/src/skeleton2dAnimationTarget.ts` at
`7f2f72624` enters the bone and slot binders into its private map at module scope. Nothing has to opt in.

**Constraint solvers are OPT-IN** — `packages/skeleton2d/src/skeleton2dConstraint.ts` at `1030a3635`
starts empty, and each family has its own registrar (`registerSkeleton2DIkConstraintSolver`,
`registerSkeleton2DTransformConstraintSolver`, `registerSkeleton2DPathConstraintSolver`).

The rule behind the difference: **preload what the package IS, make optional what it merely offers.**
Posing a rig from a clip is what skeleton2d does; a bundle that shed the bone binder would leave
`applyAnimationClipToSkeleton2D` walking channels and writing nothing — a silent no-op, not a smaller
build. A rig that never solves IK, by contrast, loses nothing by never bundling the IK solver, and a rig
that uses only IK should not carry the transform or path solvers at all.

The consequence worth stating for anyone adding a third registry: **the tree-shaking benefit is the
reason to make a family opt-in, and it is only a benefit when the family is genuinely optional.** Making
a foundational family opt-in does not shrink anything; it just moves a crash to a missing `register*`
call.

## 2. A deform offset is addressed by whatever the attachment stores its positions as

The one rule that makes deform work for meshes and paths without a special case for either.

- **Weighted attachment** (`skin` non-null): offsets parallel the **influence** stream — two floats per
  influence, walked in lockstep with it. A vertex with three bones consumes three offset pairs.
- **Rigid attachment** (`skin` null): offsets parallel the **vertex** stream — two floats per vertex.

This mirrors Spine, where a deform timeline over a weighted mesh is per-influence rather than per-vertex.
It is the detail most likely to be got wrong by reasoning from the name.

**Offsets apply to the BONE-LOCAL offset, before the weighted sum** — never to the world position after
it. Adding a bone-local displacement to a world position produces a deformation that looks correct at
rest and wrong the moment the rig moves, which is the hardest kind of bug to attribute. The tests at
`20466a2d5` (`packages/skeleton2d/src/deformMeshAttachment2D.test.ts`) assert a value only reachable if
the offset is applied first, so getting the order wrong fails rather than silently passing.

A `deform` stream too short for what it parallels is **ignored entirely** rather than read past. An
importer sizing that buffer from vertex count instead of influence count is an expected failure, not
programmer error, so it takes the sentinel.

## 3. A control point is an ordinary entry in the influence stream

A `Path`'s `data` is a flat coordinate stream in which every pair is a point, **cubic control points
included**. An authoring tool treats a handle as an offset from its anchor, but once lowered to a command
stream a handle is an absolute coordinate and needs influences of its own.

- Where the source format **states** a handle's weights, the importer uses them. Some formats weight a
  cubic vertex's own position, its in-handle and its out-handle independently.
- Where it does not, the handle **inherits the influence set of the vertex it belongs to** — the same bone
  indices and the same weights, with its own local offsets, so it travels rigidly with its anchor.

**This is an import-time DATA rule, not a runtime one.** With it applied, nothing in
`deformSkeleton2DPathAttachment` (`0fe76d2d4`) distinguishes an anchor from a handle, and the two failure
modes become unreachable rather than guarded against: handles cannot be skipped (they occupy positions in
the same stream) and tangents cannot shear (copying the anchor's bone-and-weight pairs *is* rigid travel).

Interpolating a handle's influences across the two vertices its segment spans is the wrong alternative —
it shears the tangent. Inheriting where authored weights exist is the other wrong alternative — it
discards data the file stated.

Expect a cubic path's influence stream to run roughly 3× a mesh of the same anchor count. That is a
memory note, not an architectural one.

## 4. A package.json edge is a resolution fact, not a bundle fact

`@flighthq/skeleton2d` declares `"sideEffects": false`, so a bundler drops a module nothing imports
regardless of what the manifest says. **A dependency edge therefore costs a consumer nothing unless that
consumer actually imports the module behind it.**

This was measured, not reasoned. Two runs, gzip bytes via `npm run size report=json`:

| Consumer | Without the path edge | With it |
| --- | --- | --- |
| Rig user importing skeleton2d, nothing path-related | 2051 | 2051 |
| Rig user registering only the IK solver | 2768 | 2768 |

Byte-identical both times. The first run used a stub module that called the three path query functions;
the second used the real `pathConstraint2D.ts` solver, so the result is not an artifact of the probe being
small. The probe module was also exported through the package's `contract` lane — the **harder** case,
since an exported module is more likely to be retained than a private one — and it still shook out.

**This is why path constraints live here beside IK and transform rather than in a focused neighbour
package.** The proposal to split them out rested on the premise that importing the path kernel would tax
every rig that never uses one. It does not.

The honest limit, which the numbers above do not cover: this measures what the edge costs a consumer that
**never** imports path constraints. It says nothing about what they cost a consumer that **does** — that
cost is real, it is the path kernel, and it is the honest price of the feature rather than a tax on
unrelated rigs.

**Generalize before proposing any package split on bundle-cost grounds:** establish that the cost exists
by measuring a consumer that does not use the feature. A plausible argument about manifest edges is not
evidence, and this measurement retires a whole class of speculative splits.
