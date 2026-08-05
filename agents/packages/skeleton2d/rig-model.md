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

**A pin must name a commit REACHABLE FROM THE INTEGRATION BRANCH, and that is not the same as one your
own clone can resolve.** A rebase rewrites every commit it replays, so the SHAs you wrote yesterday become
dangling objects — still resolvable locally, because your clone keeps them until it garbage-collects, and
dead for everyone else. Every pin in this file was silently in that state once: `git cat-file -e` said all
eight were fine while `git merge-base --is-ancestor <sha> origin/<branch>` said none of them was.

So the check is the second command, not the first:

    for sha in $(grep -ohE '\b[0-9a-f]{9}\b' agents/packages/<cell>/*.md | sort -u); do
      git merge-base --is-ancestor "$sha" origin/develop || echo "UNREACHABLE $sha"
    done

Re-pin after any rebase, mapping each old commit to its replayed twin by subject line. **The failure is
worth naming because it is this convention's own blind spot:** pinning exists so a reader can verify a
claim, and a pin that resolves only for its author verifies nothing while looking rigorous.

## 1. Two registries, opposite defaults, and the rule that decides which

This package carries two registries and they behave differently on purpose. Reading one and assuming the
other matches will produce a bug that only shows up as something silently not happening.

**Animation target binders are PRELOADED** — `packages/skeleton2d/src/skeleton2dAnimationTarget.ts` at
`4a1be1497` enters the bone and slot binders into its private map at module scope. Nothing has to opt in.

**Constraint solvers are OPT-IN** — `packages/skeleton2d/src/skeleton2dConstraint.ts` at `3f65ab9de`
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
`de78e0dd8` (`packages/skeleton2d/src/deformMeshAttachment2D.test.ts`) assert a value only reachable if
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
`deformSkeleton2DPathAttachment` (`97a387a9b`) distinguishes an anchor from a handle, and the two failure
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

This was measured, not reasoned. **The load-bearing quantity is the DIFFERENCE, which is zero** — two
runs of the same consumer, with and without the path module and its package edge, via
`npm run size report=json`:

| Consumer | Without the path edge | With it | Difference |
| --- | --- | --- | --- |
| Rig user importing skeleton2d, nothing path-related | 2051 | 2051 | **0** |
| Rig user registering only the IK solver (at `f692eb630`) | 2768 | 2768 | **0** |
| The same IK-only consumer re-measured at `d8f6b638b` | 2825 | 2825 | **0** |

**Read the difference column, not the absolutes.** The absolute size of a rig bundle moves whenever
anything it imports changes — the third row is the second one re-run after the guard seam became
reachable through the animation binder, +57 bytes that have nothing to do with paths. The difference is
what the rule rests on and it has stayed zero across that change. An absolute recorded here without a
commit beside it is a number that quietly stops being true; that is why each row names one. The first run used a stub module that called the three path query functions;
the second used the real `pathConstraint2D.ts` solver, so the result is not an artifact of the probe being
small. The probe module was also exported through the package's `contract` lane — the **harder** case,
since an exported module is more likely to be retained than a private one — and it still shook out.

**This is why path constraints live here beside IK and transform rather than in a focused neighbour
package.** The proposal to split them out rested on the premise that importing the path kernel would tax
every rig that never uses one. It does not.

### The dependency invariant, in its checkable form

`@flighthq/skeleton2d` **does** depend on `@flighthq/path`, and that is correct — a path constraint
positions bones along a path, which **queries** geometry (`getPathLength`, `getPathPositionAtDistance`),
and querying needs the kernel.

**Skinning a path does not.** `deformSkeleton2DPathAttachment` and the whole attachment path **write**
coordinates, so they need the `Path` **type** — free, from `@flighthq/types` — and no path function. If a
change makes the deformer import from `@flighthq/path`, that is a design failure to report, not a
dependency to add.

**Query-vs-write decides placement**, and it is the durable half. What changed is only how to check it:
an earlier version of this record verified the rule by observing that the string `@flighthq/path` appeared
nowhere in `packages/skeleton2d` except a comment. **That check is now obsolete and would mislead** — the
edge is real and legitimate. The checkable form is narrower: the import must appear only in constraint
solvers, never in a deformer.

    grep -l "from '@flighthq/path" packages/skeleton2d/src/*.ts   # expect pathConstraint2D.ts, nothing else

Match the **import form**, not the bare package name: `deformPathAttachment2D.ts` mentions the package in a
comment explaining why it does not import it, and a looser grep flags that comment as a violation. A check
that cries wolf on its own documentation gets ignored, which is worse than not having one.

The honest limit, which the numbers above do not cover: this measures what the edge costs a consumer that
**never** imports path constraints. It says nothing about what they cost a consumer that **does** — that
cost is real, it is the path kernel, and it is the honest price of the feature rather than a tax on
unrelated rigs.

**Generalize before proposing any package split on bundle-cost grounds:** establish that the cost exists
by measuring a consumer that does not use the feature. A plausible argument about manifest edges is not
evidence, and this measurement retires a whole class of speculative splits.

## Re-checking this document against the tree

Every rule above is a claim about code, so each one has a command that settles it. Run these rather than
trusting the prose — the doc is older than the tree by construction.

| Rule | Check | Expected |
| --- | --- | --- |
| 1 — binders preloaded | `grep -A3 "_binders = new Map" packages/skeleton2d/src/skeleton2dAnimationTarget.ts` | Bone and Slot entered at construction |
| 1 — solvers opt-in | `grep "_solvers = new Map" packages/skeleton2d/src/skeleton2dConstraint.ts` | constructed **empty** |
| 2 — deform addressing | `grep "inf.length\|vertices.length" packages/skeleton2d/src/skinAttachment2DPoints.ts` | `length * 2 === inf.length` weighted, `length === vertices.length` rigid — **`===`, not `>=`** |
| 3 — no handle concept | `grep -c handle packages/skeleton2d/src/skinAttachment2DPoints.ts` | `0`. In `deformPathAttachment2D.ts` the only hits are the comment saying why |
| 4 — path dependency | `grep -l "from '@flighthq/path" packages/skeleton2d/src/*.ts` | `pathConstraint2D.ts` **alone** |
| pins | `git merge-base --is-ancestor <sha> origin/develop` for each | all reachable |

All six passed on the tree this section was added to. That statement is deliberately **not** pinned to a
commit: this change is not yet on the integration branch, and by the rule above a pin naming a commit only
this clone can resolve would be worse than no pin at all.

## 5. The test for a test: would it fail if the behaviour broke?

The rules above are only worth what the tests behind them can detect, and this package is full of
geometry — the domain where a test is most likely to pass while proving nothing, because the easy
assertion is to read back the value the code just wrote.

**Assert against independently-derived ground truth, not against the implementation.** The two-bone IK
tests assert the world position of the chain **tip**, computed by hand from the triangle, rather than the
joint angle the solver produced. That distinction was not academic: it caught two real bugs before they
shipped — a child bend angle with the wrong sign, and a stretch that scaled both bones and so compounded
through inheritance. A test reading back the angle would have passed on both, because the angles were
self-consistent and the geometry was wrong.

Two habits that make the standard checkable rather than aspirational:

- **Pick a value only the correct behaviour can produce.** The path constraint's Chain-mode test asserts
  45°, which is not the tangent anywhere on its L-shaped path — so it can only pass if chain aiming is
  genuinely implemented. The deform-ordering tests assert a result reachable only if the offset is applied
  before the weighted sum, so applying it after fails rather than silently passing.
- **Mutate the source and confirm the suite goes red.** When the path constraint's twelve tests passed on
  first run, that was a reason for suspicion rather than confidence; deleting the spacing advance turned
  four of them red, which is what established they were exercising the solver at all. It costs one minute.

A test written to move a coverage counter is worse than no test: a red gate is information, and a green
gate that is wrong is anti-information. If a gate is in the way, find the cause and raise it rather than
satisfying it.
