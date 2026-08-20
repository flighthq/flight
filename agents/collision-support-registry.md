# Collision Support Registry — replacing the pair matrix with a support-function core

**Status: PROPOSAL, awaiting ruling. Raised 2026-08-20 in a direction session with the user.**

Read before adding a collision shape, touching either generic dispatcher, or acting on the
2026-07-15 unified-2D+3D decision in the [collision charter](packages/collision/charter.md). This
proposal would change what "adding a shape" means, and it is entangled with the package-naming
question — see [What this does to the package question](#what-this-does-to-the-package-question)
before renaming anything.

## The claim

`@flighthq/collision` is built as a **pair matrix**: one hand-written function per ordered pair of
shape kinds. That is O(N²) authored functions in N shapes, and it is the reason both generic
dispatchers are closed `switch` ladders that the package's own `status.md` already flags as living
on borrowed time.

The missing primitive is the **support function** — "given a direction, return the furthest point on
this shape." GJK reaches overlap and distance through nothing else, so a support-function core is
O(N): N support functions, one GJK, one EPA, and no pair functions at all.

This is the repo's own doctrine applied to a package that has not yet had it applied:

> **Complexity is a decomposition smell.** … When a unit feels complex or bloated, the cause is
> usually missing primitives *underneath* that it is silently bundling. The fix is to **extract the
> missing primitive, not to manage the complexity**. — `AGENTS.md`, Composition and Complexity

## The arithmetic that motivates it

| Shape set | Authored pair functions | Support functions |
| --- | --- | --- |
| Today: circle, aabb, obb, polygon (area kinds) | **10** | 4 |
| + chartered 2D capsule | **15** | 5 |
| Charter's 3D set: sphere, box, capsule, convex hull, triangle mesh, heightfield | **21** | 6 |

The 10 is not an estimate — `collision/status.md` records phase 1 as "the ten manifold pair tests
over a shared SAT core." Each new kind costs a whole column of the matrix; each new support function
costs one function.

## The codebase already started this, without naming it

`convexVertices.ts` exists to reduce AABB, OBB, and polygon to **one representation**:

> Materializes a box collider as the flat `[x0,y0,...]` vertex list the convex cores consume, so
> AABB, OBB, and polygon all reduce to one representation. Package-internal: these are a detail of
> how the SAT and contact-clipping cores read boxes, not part of the collision API.

Three of the six kinds are already collapsed behind a shared, shape-agnostic form. The support
function is the same instinct carried one step further — and it absorbs circle too, whose support
point is `center + radius · dir`, which the vertex-list form cannot express. The extraction is half
done and stopped at the boundary where a vertex list runs out.

## Where genericity stops

Two limits, and both are real. A proposal that hid them would be proposing the wrong thing.

1. **GJK/EPA yields a normal and one deepest point — not a manifold.** A stable stack needs two
   contact points in 2D and roughly four in 3D, and engines obtain them by clipping an incident face
   against a reference face. Face topology is exactly what a support function hides. **The clipping
   layer stays shape-aware.** The generic core cannot be the whole package.
2. **Specialized pairs are much faster.** Circle-circle is three operations; through GJK it is an
   iterative solve. Box2D keeps SAT for polygon-polygon precisely because SAT hands back the
   reference face that clipping needs anyway.

## The resolution: generic fallback, registered specializations

Both limits dissolve into the registry rather than around it, using the registration model the repo
already states — **registration is last-write-wins**, so a later binding overrides an earlier one:

- **A support-function registry keyed by shape kind.** Registering a support function makes a shape
  work against *every* other registered shape immediately, through GJK/EPA. This is the floor, and
  it is what makes the open kind union finally mean something.
- **A pair-specialization registry keyed by the kind pair.** Where a pair earns a faster or
  better-conditioned path — circle-circle, and the SAT-plus-clipping polygon pairs that already
  exist — it registers over the generic one.

The result is O(N) coverage with O(1) hot paths, and a new shape is useful the moment its support
function exists rather than after someone writes its column of the matrix.

This also satisfies the standing union→registry trigger in `AGENTS.md`, which the package is
currently on the wrong side of:

> Prefer an open registry over a closed `switch (kind)` union for descriptor and handler families …
> Keep a closed union only for a tight loop within a closed system, and revisit on growth.

## The 2D/3D boundary — the type, not the kind string

An open registry raises a fair question: what stops a 2D circle being paired with a 3D sphere?

In the scene graph, a `*Kind` does two jobs — registry key *and* hierarchy-family enforcement, so a
`Node3D` cannot enter a `Scene2D`. **Collision has no hierarchy to lean on.** Its charter is explicit
that colliders are plain data with "no scene graph, no display, no renderer," so kind does the first
job only.

The dimension must therefore live in the **static shape type and the entry point**, never in the kind
string and never in a runtime `dimension` field:

```ts
testCollision2D(a: Readonly<CollisionShape2D>, b: Readonly<CollisionShape2D>, out: CollisionManifold2D): boolean
testCollision3D(a: Readonly<CollisionShape3D>, b: Readonly<CollisionShape3D>, out: CollisionManifold3D): boolean
```

Two shape unions, two entry points, two registries. Passing a sphere to `testCollision2D` is a
compile error because the unions never unify. **The registry is open along the axis meant to grow
(shapes) and closed along the axis that must not (dimension).**

This is why the chartered `testCollision` → `testCollision2D` / `testCollision3D` rename is
load-bearing rather than cosmetic: it *is* the boundary that replaces the graph's role. The SDK
already solves this same shape the same way — `registerRenderer(state, FooKind, renderer)` is one
registry pattern serving both dimensions, separated by distinct entry points and state
(`prepareScene2DRender` / `prepareScene3DRender`), not by a dimension tag on the payload.

The support-function design reinforces the boundary for free: a 2D support function is
`(shape, dirX, dirY, out)` and a 3D one is `(shape, dirX, dirY, dirZ, out)`. Different arity — they
cannot share a registry even by accident.

Enforcement does exist one level up for some callers, since a `Physics2DWorld` holds 2D bodies and
only ever reaches 2D collision. That is real but cannot be the mechanism: `collision` is a standalone
package usable with no physics world at all.

## Three defects this must fix on the way through

Found while checking the above. Each is independent of the ruling, and each gets worse if 3D kinds
land on the current structure.

1. **An unrecognized pair fails as a silent `false`.** `shapeKindRank` returns `-1` for an unknown
   kind, and `testCollision` then clears the manifold and reports non-overlapping
   (`testCollision.ts:34`). If dimensions ever did mix, the result would not be a crash — it would be
   "these are not touching," which is indistinguishable from correct output. A missed collision is
   the worst available sentinel. **Mixing must be a compile error, or a loud one; never a sentinel.**
   This is a guard-layer case under [diagnostics](conventions/diagnostics.md), not a comment.
2. **The kind union is open but the shape union is closed.** `CollisionShapeKind` admits any string
   via `(string & {})` (`types/src/Collision.ts:13`), but `CollisionShape` is a closed tagged union
   of exactly the six built-ins (`types/src/Collision.ts:66-72`). A custom kind cannot be constructed
   as a `CollisionShape` without a cast, so the advertised vendor extensibility does not exist. Fixing
   the dispatcher alone would leave the type still closed — **both halves move together or neither
   does.**
3. **Both generic dispatchers are closed `switch` ladders**, already recorded as open in
   `collision/status.md` with the union→registry trigger named. This proposal is the shape that
   trigger firing should take.

## The C/C++ port consideration

Portability is a stated design constraint, and it decides what "generic" is allowed to mean.

A C support function is `support(const Shape*, const float* dir, float* out)` — dimension-erased
pointers, where nothing prevents passing a 2-vector where a 3-vector is expected. The TS side must
therefore keep **two concretely-typed families that lower to `gjk2d` / `gjk3d`**, rather than one
dimension-erased core parameterized by width.

So *generic* here means **one shared algorithm design, instantiated twice** — not one shared
function. Only the first survives the port, and the distinction should be settled before code is
written, because it is invisible in TypeScript and structural in C.

## Risk

The honest risk line is not the line count, it is the robustness work that would be re-fought.

`collision` is 2,964 non-test source lines across 17 files, with 15 colocated test files. More to the
point, its charter and `status.md` record specific degeneracy and determinism battles already won:
`canonicalizeScratchAxis` plus the lexicographic tie-break in `isPreferredAxis` for coincident
centroids, extent-scaled epsilons replacing magnitude-absolute ones, per-pair rejection of degenerate
shapes, and the positional-multiplication `featureId` packing that replaced shift-packing after it
was found to wrap past 1024 vertices.

GJK and EPA have their own termination, epsilon, and simplex-degeneracy minefield. **Adopting them is
choosing to fight an equivalent campaign**, and the existing tests do not transfer to it: they assert
against SAT's outputs, not against a support-function core's.

Mitigation the proposal assumes: land the generic core **behind** the existing specializations rather
than in place of them, so the SAT paths keep serving the pairs they already serve correctly and the
generic path is exercised first by new shapes, where there is no incumbent to regress.

## What this does to the package question

It inverts the answer, which is why the two must be decided together and in this order.

`register.md:85` states the standing test: *"does the dimension change the mathematical model, or
just the representation? If the model is the same, one package with suffixed types; if the model
differs, separate packages."*

- Against **today's** pair-matrix core, 2D and 3D share no implementation — SAT versus GJK/EPA — and
  the test returns *split*: `collision2d` / `collision3d`.
- Against a **support-function** core, the model is the same in both dimensions and only the vector
  width changes. The test returns *unified*.

So the package rename is downstream of this ruling. Renaming first is the expensive order: 16
importing files and manifests, 44 files referencing `Collision*` types, and 17 exported type names
would be renamed, and then the thing that was renamed would be rewritten.

**A separate defect, true either way:** `register.md` contradicts itself on this exact point. Its
Split table justifies `physics2d`/`physics3d` with *"contact generation (SAT vs GJK/EPA)"*, while its
Unified table places `collision` with *"GJK/EPA joins same package."* The same fact, two tables apart,
cited in both directions. Whichever way collision is ruled, one of those rows is wrong and should be
corrected in the same change.

## Recommendation

Adopt the support-function registry, keep `@flighthq/collision` unified, and sequence it as:

1. **Rule this proposal.** Nothing below is safe to start first.
2. **Split the types by dimension** — `CollisionShape2D` / `CollisionShape3D` and the matching
   manifolds — and rename `testCollision` to `testCollision2D`. This is the boundary, and it is
   worth landing on its own because it is mechanical and independently correct.
3. **Close defect 1** (silent `false` → guard + explain seam) and **defect 2** (open kind / closed
   union) together, since both are about the same lie in the type.
4. **Add the support registry with GJK/EPA as the 2D fallback**, behind the existing SAT
   specializations. 2D first, where there is an incumbent to differential-test against.
5. **Add 3D shapes on the proven core**, which is the point of the exercise.
6. **Correct the `register.md` contradiction** and the collision charter's Open direction 4.

## Proposed charter decision

To append to `agents/packages/collision/charter.md` under Decisions if ruled:

> **[2026-08-20] The narrow-phase core is a support-function registry, not a pair matrix.** Shapes
> register a support function ("furthest point in a direction") and reach every other registered
> shape through a shared GJK/EPA core; pair specializations register over that floor where they earn
> it, last-write-wins. Rationale: the pair matrix costs O(N²) authored functions in N shapes — 10
> today, 21 for the chartered 3D set — while support functions cost O(N), and the vendor
> extensibility the open `CollisionShapeKind` already advertises is unreachable without it. The
> generic core does not replace contact clipping, which needs face topology a support function hides.
> Because the core is then dimension-independent, the package stays **unified**, superseding nothing
> in the 2026-07-15 ruling but supplying the reason it holds. The dimension boundary is carried by
> the shape types and entry points (`testCollision2D` / `testCollision3D`, disjoint shape unions),
> never by the kind string or a runtime field, because `collision` has no hierarchy to enforce
> families the way the scene graph does. `generic` means one algorithm design instantiated twice
> (`gjk2d` / `gjk3d`), not one dimension-erased function, so the C port keeps its types. User-directed.

## What is not proposed

- **No change to the manifold contract.** `CollisionManifold` and `CollisionContactManifold` stay two
  lanes, per the 2026-07-29 decision; the cheap overlap path must not start linking clipping
  machinery.
- **No change to argument-order semantics.** The 2026-07-29 ruling that stable ordering is the
  caller's to supply, from persistent identity rather than geometry, is untouched and applies equally
  to a support-function core.
- **No removal of the direct per-pair functions.** They are documented as the hot path and remain
  exported.
- **No 3D work begins here.** This proposal is about the core's shape; the 3D shape set arrives in
  step 5 and only after 2D proves it.
