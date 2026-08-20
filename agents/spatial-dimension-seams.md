# Spatial Dimension Seams — two suffixed seams, not one generic index

**Status: RATIFIED 2026-08-20 by the user.** The ruling is recorded in the
[spatial charter](packages/spatial/charter.md) Decisions; this note is the reasoning behind it.

Read before adding a 3D broadphase backend, widening `SpatialAabb`, or acting on the 2026-07-15
unified-2D+3D decision in the [spatial charter](packages/spatial/charter.md). That decision is sound;
its wording describes a seam that does not exist, and this note supplies the shape that makes it true.

## The claim

The 2026-07-15 decision says 3D backends "slot into the existing swappable-backend architecture."
**They cannot** — the seam is 2D in its types, not merely in its implementations. The fix is not to
make the seam dimension-generic. It is to have **two seams**, each dimension-native, over one shared
policy layer, in one package.

`@flighthq/spatial` stays unified. What changes is that the existing types acquire a `2D` suffix and
gain 3D twins, exactly as `register.md` already prescribes for a unified package.

## What is actually built

The seam is 2D at every point a dimension could enter (`types/src/Spatial.ts`):

```ts
export interface SpatialAabb {            // :21 — no z
  minX: number; minY: number; maxX: number; maxY: number;
}

export interface SpatialIndexBackend {    // :43
  insertSpatialObject(id: SpatialObjectId, bounds: Readonly<SpatialAabb>): boolean;
  querySpatialPoint(x: number, y: number, out: SpatialObjectId[]): void;
  querySpatialRay(x: number, y: number, dx: number, dy: number, out: SpatialObjectId[]): void;
  // …
}
```

A BVH or octree cannot register behind that, because the bounds type it would be handed has no third
axis and the point/ray queries have no third argument. The charter's own Open direction 4 ("BVH and
octree … behind the same `SpatialIndexBackend` seam") describes something the type system forbids.

The type file even records the 2D-ness as deliberate, noting `SpatialAabb` is "distinct from
`@flighthq/geometry`'s `Aabb`, whose corners are 3D." The seam was correctly built for the job it had;
it was never dimension-generic, and the decision text assumed it was.

## Why not simply widen the seam

Adding `z` to `SpatialAabb` and a third argument to the queries is the obvious move and the wrong one.

The seam's consumers are `camera`, `interaction`, `physics2d`, and `sdk` — and **every current
consumer is 2D**. `camera` uses it for culling and `interaction` for hit testing. Widening makes all
of them carry a dimension they do not have, store bounds a third larger, and read
`querySpatialRay(x, y, z, dx, dy, dz)` for a two-dimensional hit test.

That is the standing bundle invariant, stated as a rule in `AGENTS.md`: *an assembly never inflates
the bundle cost of a primitive.* A 3D capability is an assembly here; the 2D index is the primitive.

It is also the kind of genericity that lowers badly. Dimension-parameterized bounds become either a
generic in TypeScript or a variable-length array in C, and neither is the "reusable value types over
deep object hierarchies" the portability rule asks for.

**The distinction worth holding onto:** the genericity proposed for `collision` (see
[collision support registry](collision-support-registry.md)) is *behavioral* — one algorithm, many
shapes — and it costs callers nothing. The genericity tempting here is *structural* — one bounds type,
two dimensions — and it taxes every caller. Behavioral genericity generalizes; structural genericity
just makes everyone pay for the larger case.

## Why unified is nonetheless right

The register's standing test (`register.md:85`) is *"does the dimension change the mathematical model,
or just the representation?"* Spatial passes it where collision fails it:

- A uniform grid in 3D is a uniform grid with one more axis in the cell walk. A quadtree becomes an
  octree. The structures are the same structures.
- Structure choice is *already* a backend-level difference the seam exists to absorb, and 2D has its
  own alternates chartered (quadtree, sweep-and-prune). "BVH vs grid" is not a dimensional
  distinction; it is the distinction the package was built around.

The decisive evidence is that **the shared policy layer already exists and is already
dimension-neutral.** These types in `types/src/SpatialIndexing.ts` describe how an index holds
objects, and not one of them mentions an axis:

```ts
export type SpatialIndexingMode = 'absent' | 'cells' | 'declined' | 'overflow';   // :25
export type SpatialDeclineReason = 'inverted-bounds' | 'non-finite-bounds';       // :29
export type SpatialIndexingOperation = 'insert' | 'remove' | 'update';            // :32
export type SpatialIndexingReason = SpatialDeclineReason | 'invalid-cell-size' | 'missing-id';  // :37
```

Object identity, the oversized-extent overflow policy, declining non-finite bounds, `bucketCount` as
the cost measure, and the whole `explainSpatialIndexing` seam are identical in three dimensions. That
is a real shared layer, and it is precisely what `collision` lacks — which is why the two packages get
opposite answers from the same test.

## The proposed shape

Per `register.md`'s naming convention — *"when both 2D and 3D types coexist in one package, both get
explicit suffixes"*, with `Camera2D`/`Camera3D` as the precedent:

**Suffixed (dimension-bearing):**

| Today | Becomes | Plus |
| --- | --- | --- |
| `SpatialAabb` | `SpatialAabb2D` | `SpatialAabb3D` |
| `SpatialIndexBackend` | `SpatialIndexBackend2D` | `SpatialIndexBackend3D` |
| `SpatialIndex` | `SpatialIndex2D` | `SpatialIndex3D` |
| `SpatialIndexRuntime` | `SpatialIndexRuntime2D` | `SpatialIndexRuntime3D` |
| `SpatialPair` | `SpatialPair2D` | `SpatialPair3D` |
| `createSpatialIndex` | `createSpatialIndex2D` | `createSpatialIndex3D` |

`SpatialPair` carries only two ids and is structurally dimension-free; it is suffixed anyway so that
a pair cannot be handed to the wrong index's confirm step. If that reads as noise at implementation
time it is the one row worth revisiting.

**Unsuffixed (the shared policy layer):** `SpatialObjectId`, `SpatialIndexingMode`,
`SpatialDeclineReason`, `SpatialIndexingOperation`, `SpatialIndexingReason`,
`SpatialIndexingExplanation`, `SpatialIndexingNotice`, `SpatialIndexingGuard`, and
`MAX_INDEXED_CELLS_PER_OBJECT`. Suffixing these would assert a distinction that does not exist and
would double the diagnostics vocabulary for nothing.

**Backend factories follow the vocabulary-distinct rule** — *"where names are vocabulary-distinct
(Circle vs Sphere), no dimension suffix is needed"*:

- `createQuadtreeSpatialBackend` (2D) and `createOctreeSpatialBackend` (3D) — distinct words, no
  suffix.
- `createUniformGridSpatialBackend` → **needs** a suffix; a grid is dimension-ambiguous.
- `createSweepAndPruneSpatialBackend` and `createBvhSpatialBackend` — both ambiguous, both suffixed.

## Blast radius

16 importing files and manifests; 20 files referencing `Spatial*` types; 13 exported type names, of
which 6 are suffixed and 7 stay as they are. Consuming packages: `camera`, `interaction`, `physics2d`,
`sdk`, `types`.

`@flighthq/spatial` is a **core**-layer package (`scripts/package-layers.ts:23`), so the rename
touches central policy and every layer above it. That raises the review bar; it does not change the
answer, and the cost only grows as consumers accumulate.

Mechanical throughout — no behavior changes, no algorithm changes, no new tests beyond renamed ones.

## Recommendation

Land the suffixing **before** any 3D backend work starts, as its own change. It is independently
correct (the current unsuffixed names claim a generality they do not have), it is pure mechanism, and
doing it afterwards means renaming through a second consumer set.

## Proposed charter decision

To append to `agents/packages/spatial/charter.md` under Decisions if ruled:

> **[2026-08-20] Two dimension-native seams in one package, over a shared policy layer.** The
> 2026-07-15 unification holds — `spatial` stays one package — but 3D does **not** arrive behind the
> existing `SpatialIndexBackend`, which is 2D in its types (`SpatialAabb` has no z; the point and ray
> queries take no third axis) and was never dimension-generic. The seam is suffixed
> (`SpatialIndexBackend2D` / `SpatialIndexBackend3D`, `SpatialAabb2D` / `SpatialAabb3D`,
> `createSpatialIndex2D` / `createSpatialIndex3D`) while the policy vocabulary that is genuinely
> dimension-free — object identity, indexing mode, decline reasons, `bucketCount`, the
> `explainSpatialIndexing` seam — stays unsuffixed and shared. Widening one seam to three dimensions
> was rejected: every current consumer (`camera`, `interaction`, `physics2d`) is 2D and would pay for
> an axis it does not use, which is the bundle invariant. Backend factories suffix only where the
> structure's name is dimension-ambiguous, so `createQuadtreeSpatialBackend` and
> `createOctreeSpatialBackend` need none while `createUniformGridSpatialBackend` does. User-directed.

Open direction 4 in the same charter should be reworded at the same time: BVH and octree arrive
behind the **3D** seam, not "the same" one.

## What is not proposed

- **No change to the uniform grid's cost bounds.** The 2026-07-30 decisions on oversized extents,
  the overflow list, and declined non-finite bounds are policy that applies unchanged in 3D.
- **No 3D backend.** This is the naming and seam change that has to precede one.
- **No resolution of Open direction 5** (where a log-backed `enableSpatialGuards` lives). That is a
  layer-policy question, independent of dimension.
