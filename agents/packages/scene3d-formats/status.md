---
package: "@flighthq/scene3d-formats"
updated: "2026-07-29"
by: builder
---

# scene-formats — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-07-29 — Four-parser read-geometry audit; 3ds hang + awd2 inflate bomb fixed (builder, review-directed)

Authorized follow-on to the glTF read-integrity work. Axes derived from first principles and **committed
before any parser was opened** (`agents/read-integrity.md`, commit bf1774e2b) so "derived first" is
checkable rather than asserted, with a recorded prediction per format. The audit then found five failure
geometries the eight axes do not name; they are now axes 9-13 in that doc, each attributed to the parser
that produced it.

**TWO SEVERE DEFECTS FIXED (c62bf62f3).**

- **3DS hangs on a 12-byte file.** Every chunk walk advances by `cursor = chunkEnd`, so a declared chunk
  length of 0 puts the end back at the cursor and the loop never progresses. Not a throw — a HANG:
  uncatchable, takes the whole import with it, and it violates the module's own "never throws on bad
  input" contract more severely than a throw would. **The trigger is not adversarial: zero padding inside
  a parent whose declared length still covers it**, which is what a block-aligning exporter produces.
  Verified live before fixing (a 12-byte file, `timeout` exit 124; with the fix removed again it hung the
  vitest runner itself). Fixed structurally: all eight chunk walks now derive their advance from one
  `readChunkEnd`, which rejects a length shorter than the header. Five of the eight already had that
  guard and three did not — the asymmetry *is* axis 11, and routing every walk through one definition is
  what makes a non-terminating walk unrepresentable rather than an invariant eight loops must remember.
  Lengths 1-5 are the same defect's quiet sibling (the cursor advances but lands mid-header, so the rest
  of the parent silently vanishes); both probes added.

- **AWD2 inflate is an unbounded allocation.** `InflateState.writeByte` doubled its output buffer with no
  cap, and the `AwdDecompressor` seam carries no output limit. A ~300 KB crafted stream declares 300 MB;
  the ratio is arbitrary. This is axis 13 and it is genuinely outside the original eight: **every other
  axis assumes the quantity sizing an allocation is a field that can be checked against the buffer, and
  under decompression it is the compression ratio — not in the file, not bounded by its length, reachable
  by no per-field check.** Capped at 256 MB; the throw is caught by the existing boundary and becomes a
  clean `awd2.decompression-failed` Reject. Verified: a 300 KB bomb is now rejected in 1.3 s. The
  *uncapped* case was deliberately NOT executed — it is an unbounded allocation on a real machine, and the
  absence of any bound is a code-reading certainty, not a hypothesis needing a demonstration.

**REMAINING, NOT YET FIXED — reported for sequencing, not silently carried.** The audit surfaced far more
than these two. Full findings are in the handoff to review; the shape of what is left, by parser:

- **md5Parse / md5AnimParse — the worst of the four, and the one on the demo path.** Recovery-induced
  reindexing (axis 12) is the headline: dropping one malformed `vert`/`weight`/`joint` line shifts every
  later record, silently redefining every index that names it, *through bounds checks that still pass*.
  Triangle indices are never bounds-checked at all (a negative index wraps through `Uint32Array.from` to
  ~4.29e9 and reaches the GPU); `numverts`/`numtris`/`numweights`/`numJoints` are parsed and discarded,
  and they are precisely the signal that would catch the reindexing at the record where it began. A
  negative `startWeight` throws. `parentIndex < -1` is silently treated as root while `>= length` is
  correctly reported — the exact asymmetry. An unrecognised file parses to a valid empty document with
  zero diagnostics. `.md5anim` never verifies it describes the same skeleton as the `.md5mesh`.
- **awd2Parse — stream data bounded by the block rather than the sub-mesh** (textbook axis 3, the check
  names the outer region); `readAwdString` bounds-checks nothing and `subarray` clamps silently against
  the whole buffer; `skipAwdAttrList` returns a cursor derived from an unvalidated length; unknown stream
  data type falls through to float32/width-4 (axis 4 verbatim); `positions.length / 3` unfloored yields a
  NaN vertex; no Adler-32 verification; header flags and version-minor never read.
- **md2Parse — the `framesize` field at header offset 16 is the independent anchor** for a bound the
  parser currently derives from `numVertices` (axis 9), and it is never read; `offEnd` likewise. Sections
  are never checked for disjointness (axis 10). `offSkins` has neither a lower bound nor an aggregate
  bound and fabricates a 64-NUL material name from out-of-buffer reads.
- **threeDsParse — remaining:** UV count never compared to vertex count (silent fallback to (0,0)); counts
  smaller than their payload; unbounded recursion depth (~45 KB of nested headers overflows the stack);
  duplicate chunks last-win with a bare assignment, so a malformed second VERTICES destroys a good first.

**SEVERITY, honestly.** md5 is on the demo path (`importMd5Mesh` is the composer for a shipped skeletal
sample) and has the most category-(b) silent-wrong-read findings — highest priority. 3ds and awd2 both had
a live unrecoverable defect, now closed; their remaining findings are silent-wrong-read, not crash. md2 is
the least-used and its worst finding fabricates a material name rather than corrupting geometry — lowest.

**DOES `resolveGltfReadOffset` GENERALISE?** No, and the audit is unanimous on why: what these parsers
share is not a bounds *computation* but a bounds *discipline*. glTF resolves a nested strided window
(accessor ⊂ bufferView ⊂ buffer); 3DS needs a chunk-header cursor whose advance is provably positive;
MD2 needs an absolute file-relative strided region plus a partition check across siblings; AWD2 needs a
narrowable region cursor that cannot widen. Those are four different shapes, and a helper absorbing all
four would be a switch over formats wearing a function's clothes — the decomposition floor is per-format.
What DOES generalise is the axis list itself, plus one structural rule that fixes the largest class in
every parser: **identical read shapes must share one implementation** (axis 11). Each parser wants its own
small resolver — `readChunkEnd` here is the first — and the win is that the guard set can no longer
diverge across copies. Cross-parser sharing would buy a name and cost the fit.


## 2026-07-29 — Read-geometry integrity: the validation census re-derived on the right axes (builder, review-directed)

review2 re-gated the Step D census on merged develop and found two cells it had reported closed while the
underlying property was never checked. Both are the silent-wrong-read class the census declared shut. A third
site of the same class turned up while fixing them.

**THE AXIS ERROR — what actually went wrong, since it matters more than the patch.** The old census was
`consumer × type-validated × window-bounded × fault→role`, 13 rows, every cell ticked. Four faults compounded:

1. **It was derived from the patch, not from the read.** Its columns were the names of the three fixes that
   had just landed, so it could only ever ask "did I do the thing I did?". A census whose axes come from the
   remedy cannot surface what the remedy missed. The axes have to come from _what must hold for this read to
   address the right bytes_, enumerated before looking at the code.
2. **13 rows over 3 real read sites.** The rows were accessor _consumers_ (POSITION, NORMAL, indices, IBM,
   animation input/output, morph…), but every one of them reaches bytes through the same `readAccessor` base
   read. Geometry is a property of the READ SITE; only `fault→role` is a property of the consumer. Ticking
   `window✓` thirteen times was one belief restated thirteen times — it read as breadth and supplied none,
   and the repetition is exactly what made "every cell closed" feel earned.
3. **`window-bounded` was one checkbox over two independent bounds.** A span is contained by its start AND
   its end. The upper bound was implemented, so the box was ticked; the lower bound was never written and
   never missed. A negative `byteOffset` walks the read backward out of the declared view and every
   upper-bound test still passes, because the read ends where it always did.
4. **`type-validated` was mistaken for element-width integrity.** The type axis proves the accessor's
   _declared_ element type is what the consumer expects. It says nothing about whether the declared _layout_
   delivers that element intact — `byteStride` lives on the bufferView, not the accessor, so it can contradict
   the type without the type ever being wrong. A VEC3 over a 4-byte stride is `type✓ window✓` and imports
   overlapping garbage.

Under all four sits one unexamined assumption: **the spec declares these offsets/lengths/strides/counts to be
nonnegative integers and the TypeScript schema repeats it, so I read the declaration as a guarantee.** There is
no runtime schema validator behind the parse. Every blocker below reduces to that one belief.

**FIXED, structurally.** A single `resolveGltfReadOffset` now resolves every strided read — base accessor,
sparse indices, sparse values — proving all three properties before a byte is touched, returning the absolute
offset or `-1`; callers classify by role exactly as before. `isGltfByteCount` is the shared nonnegative-integer
predicate. Element width and count are proven in `readAccessor` _before_ the allocation they size. Closed:

- **lower bound (review2 blocker 1)** — `baseOffset` was only ever compared against the upper limit. A decoy
  before the view plus `accessor.byteOffset: -12` imported it as vertex data with zero diagnostics. Identical
  hole on the sparse values lane (a bad override Recover-skips; the base data is still good).
- **element width / stride (review2 blocker 2)** — any positive `byteStride` won, with no `stride >=
  elementByteSize` check. Now honored verbatim and rejected when narrower, rather than silently retightened;
  an absent or 0 stride still means tightly packed (0 is out-of-spec but common exporter shorthand).
- **unknown `type` / `componentType`** — the width tables return `undefined`, which propagates as NaN through
  every bound test and makes each one _pass_, then `readComponent` falls through to `getFloat32`. Found while
  re-deriving, not reported.
- **malformed `count`** — a fractional count silently truncates the allocation (2.5 VEC3 → 7 floats) while the
  read loop runs three times, so the last vertex writes off the end and a fractional vertex count flows
  downstream; a negative count throws RangeError out of the whole import. Found while re-deriving.
- **image bufferView slice (third site, not reported)** — the old census ticked this `✓ (Uint8Array.slice)`.
  Slice cannot overrun, which is true and irrelevant: a NEGATIVE start is not out-of-bounds, it is a different
  addressing mode that silently retargets the read to the buffer's tail. The API was checked for throwing, not
  for wrong-addressing — the same axis error wearing a different disguise.

`gltf.accessor-past-buffer` → **`gltf.accessor-invalid-read`** and `gltf.sparse-past-buffer` →
**`gltf.sparse-invalid-read`**: the old names describe one direction of one of the three properties now
enforced, so they would have actively misled anyone debugging an underrun or a stride fault.

**RE-DERIVED CENSUS.** Two tables, because the two axis families belong to different subjects — conflating
them is what produced the phantom breadth in fault 2 above.

_Read sites × geometry properties_ (every site that computes a byte address from JSON numbers):

| read site | width sound | offsets ≥ 0 ∧ integral | span ends in window ∧ buffer | count sound |
| --- | --- | --- | --- | --- |
| accessor base read (`readAccessor`, all 7 consumers) | ✓ type + componentType known, stride ≥ element | ✓ | ✓ | ✓ |
| sparse index read | ✓ componentType known, no stride permitted | ✓ | ✓ | ✓ |
| sparse value read | ✓ componentType known, no stride permitted | ✓ | ✓ | ✓ |
| image bufferView slice | n/a (opaque bytes) | ✓ | ✓ (`slice` clamps upward) | n/a |
| GLB chunk reads | n/a (fixed 4-byte header fields) | ✓ (uint32-sourced, unsigned by construction) | ✓ header/length guards | n/a |

_Consumers × fault→role_ (unchanged by this work; the axis that IS per-consumer):

| consumer | expected type | fault → role |
| --- | --- | --- |
| primitive POSITION | VEC3 | count0/fault → primitive Drop |
| NORMAL / TANGENT / TEXCOORD_0 | VEC3 / VEC4 / VEC2 | fault → Recover, absent |
| JOINTS_0 / WEIGHTS_0 | VEC4 / VEC4 | fault → Recover, unskinned |
| primitive indices | SCALAR | fault → primitive Drop |
| skin inverseBindMatrices | MAT4 | fault/short → identity Recover |
| animation input (times) | SCALAR | fault → channel Drop |
| animation output | VEC4/VEC3/SCALAR by path | fault → channel Drop |
| morph POSITION delta | VEC3 | fault → target/whole-morph Drop |
| morph NORMAL / TANGENT delta | VEC3 | fault → Recover, absent |
| sparse destination index | < accessor.count | out-of-range → Recover, skip override |
| image bufferView | — (bytes) | unreadable window → image Drop |

Five regression probes, each verified to FAIL against the pre-fix parser (four with zero diagnostics emitted —
the silent-corruption signature — and one, the negative count, throwing out of the import). scene-formats
509/509 (gltfParse 128/128), `npm run check scene3d-formats` exit 0.

**WHAT REMAINS UNPROVEN.** These fixes make each read address the bytes the file _declares_. Nothing here can
tell whether those bytes are the ones the file's author _meant_ — a well-formed accessor pointing at the wrong
bufferView is still imported faithfully. That is not a gap to close in the parser; it is the boundary of what
read-integrity validation can assert, and it should not be re-declared as a closed cell by a future census.

## 2026-07-25 — Diagnostics honesty capstone: uniformity audit + sweep-safe silent-drop batch (builder, review-directed)

Capstone on top of the completed structured-diagnostics rollout (all 9 *-formats parsers converted). A
uniformity audit (4 parallel scans) confirmed the conversion is consistent: origins are the physical
emitter everywhere (zero mismatches), the Reject/Drop/Recover/Skip axis is applied the same way, and the
severity vocabulary is uniform. Cross-format confirmation: awd2 `block-length-past-end` (Recover+break) is
the SAME convention as gltf `glb.chunk-past-end` (a break that keeps already-parsed elements is a partial
recovery, not a Drop). Then a sweep-safe fix batch closed silent-drop gaps that had a sibling precedent:
`3ds.face-subchunk-exceeds`/`3ds.mesh-empty`/`3ds.material-missing`, `md5mesh.shader-unquoted`,
`gltf.node-child-out-of-range`/`gltf.animation-target-unresolved`, `md2.skin-empty-path`,
`awd2.geometry-truncated`/`awd2.submesh-truncated`. The sequenced honesty work is now COMPLETE (review-ruled,
all through review2): A = the sweep-safe silent-drop batch above; C = threaded the collector through the gltf
material/image/texture subtree; B-diag = a Skip-crumb sweep so every parser crumbs its recognized-but-unmodeled
features; D = gltf primitive/accessor Drop-vs-Recover.

**D's SHARPENED principle (first D attempt FAILED review2, reworked):** the first attempt blanket-relabeled
`readAccessor`'s faults Drop→Recover, which was context-blind — review2 caught four output-level lies and
review sharpened the rule: **Recover requires a USABLE SURVIVOR (a non-empty, non-NaN, drawable element);
otherwise Drop and actually drop.** The fix makes `readAccessor` classification-free — it returns a structured
`{count, data, fault}` (fault = kind + detail, no severity) and each caller decides severity by the accessor's
ROLE via `reportGltfAccessorFault`:
- POSITION accessor fault (mandatory) → the primitive is unusable → `gltf.primitive-no-position` **Drop** +
  drop the primitive; the subsuming accessor fault is NOT emitted as a contradictory Recover.
- optional attribute fault (normal/tangent/uv/joints/weights) where POSITION survives → treated as ABSENT
  (`readOptionalGltfAttribute` returns null → vertex loop zero-fills finite defaults, never NaN) + the fault
  kind **Recover**. A count mismatch is likewise treated as absent.
- indices accessor fault (or empty indices) → topology is lost, storage order is not a sane triangle list →
  **Drop** + drop the primitive (`gltf.primitive-empty-indices` for the valid-but-empty case).
- unsupported primitive mode → no sane drawable interpretation → `buildGltfPrimitiveElements` returns null →
  `gltf.primitive-unsupported-mode` **Drop** + drop the primitive (was wrongly Recover-with-empty-geometry).
- collateral call sites the blunt relabel had touched, now fixed too: skin `inverseBindMatrices` fault →
  identity IBM per joint (bind pose, not a zero-matrix collapse) **Recover**; animation sampler input/output
  fault → drop the channel **Drop** (matches sibling channel drops); morph target POSITION-delta fault → drop
  the target **Drop**, optional NORMAL/TANGENT deltas → absent **Recover**.
Per-mode geometry-output regressions added (position-fail drops mesh; optional-fail keeps a finite drawable
mesh with zeroed normals; index/mode-fail drop the mesh). **Output-shape change** still stands: dropping the
no-POSITION/failed-mandatory primitive means fewer mesh nodes, so a consumer assuming glTF-primitive-index↔
child-node alignment would shift; relabel-only fallback if ever needed. No such consumer today.

**D second re-gate (review2-a8b72928 FAIL) — five role-semantics edge cases, all fixed.** The output blockers
were fixed but count-mismatch and index-correspondence cases slipped through. Applied the same usable-survivor
rule to each: (1) an optional attribute whose count ≠ the primitive's vertex count is now Recover-crumbed
(`gltf.accessor-count-mismatch`, detail accessor/expected/actual) before zero-filling, not silently dropped;
(2) a present-but-short `inverseBindMatrices` accessor (count < joints) now recovers to identity for ALL joints
(`gltf.skin-ibm-count-mismatch` Recover) instead of zero-filling missing joints (which collapsed the mesh);
(3) `buildGltfMorph` now takes the base vertex count and drops a target whose POSITION-delta count ≠ base
(`gltf.morph-target-count-mismatch` Drop); (4) because dropping ONE morph target renumbers survivors and
desyncs target↔weight↔animation indexing, ANY invalid target now drops the WHOLE morph set (return null), so
indexing stays honest — weights index-align 1:1 with the surviving targets; (5) an animation sampler with an
empty or ragged (values not a whole multiple of times) accessor pair now drops the channel
(`gltf.animation-sampler-empty` Drop) so no empty-channel animation is created. Five probe regressions added.
scene-formats 497/497 (gltfParse 116/116), npm run check exit 0.

**Item-4 morph-drop granularity — RULED whole-set-drop (review, on record).** When any morph target is invalid
the WHOLE set drops, not just that target. Why this over individual-drop-with-weight-remap: (a) whole-set-drop
is provably correct and trivially honors the no-weight-shift invariant (no partial survivors = nothing to
renumber); (b) a morph target set is authored as a COHERENT unit (facial blendshapes etc.) — a partial-morph
survivor missing one target is usually visibly wrong, not graceful degradation; (c) the remap alternative would
thread a survivor-index map from `buildGltfMorph` into `buildGltfAnimations` purely to preserve that low-value
partial case — completeness-for-a-rare-case bought with a cross-function index-aliasing bug surface, against the
"small functions, explicit ownership" rule. POSSIBLE FUTURE DEEPENING (do NOT build speculatively): individual-
target-drop with mesh-weight + weights-animation-value remap, keeping the good targets when one is bad. Revisit
ONLY if a real asset shows a partial-morph survivor is worth the cross-function index-map coupling.

**D exhaustive accessor-site sweep (review directive + review2-954ae4c2 6th finding).** review confirmed the
classification-free `readAccessor` + role-based classification is the right architecture and pushed to sweep
EVERY accessor consumer so no further gap remains. Two closed: (a) `applyAccessorSparse` read `sparse.count`
elements through a DataView with NO bounds guard — an oversized count threw a RangeError; now guarded (skip the
override, keep the valid base accessor data → `gltf.sparse-past-buffer` Recover). (b) the animation cardinality
guard checked flattened `values.length % times.length` — a LINEAR VEC4 output with 1 element vs 2 keys has
length 4 and passed (4 % 2 == 0). Now validates ELEMENT counts by interpolation: fixed-width channels require
`outputCount === (CUBICSPLINE ? 3 : 1) · inputCount` (`gltf.animation-sampler-cardinality` Drop), and weights
channels are validated per-mesh in `appendGltfWeightsChannels` against `perKey · keys · targetWidth`
(`gltf.weights-cardinality-mismatch` Drop) since their SCALAR output is target-width-scaled. The complete
accessor-consumer census: 7 `readAccessor` sites (skin IBM, animation input/output, primitive POSITION/indices,
morph POSITION, `readOptionalGltfAttribute`) + `applyAccessorSparse` + the two animation cardinality gates —
all now apply the usable-survivor rule. Image bufferView slicing uses bounds-safe `Uint8Array.slice` (no throw)
and GLB parsing has its own header/length guards. Three more regressions. scene-formats 500/500
(gltfParse 119/119), npm run check exit 0.

**D READ-INTEGRITY foundation (review-2153529d + review2-16c12072 findings 1–3).** review reframed review2's
three findings as a deeper class than severity-labeling: READ-INTEGRITY that was never happening — the
usable-survivor rule is meaningless if the read itself silently pulls bytes from OUTSIDE the accessor's window
or reinterprets a wrong-width type. Fixed as a structural layer (not three patches), then a full validation
census (below) surfaced and closed everything in one pass:
- **accessor TYPE validation** — `readAccessor` gained an `expectedType` param; a wrong element type (e.g. a
  VEC3 "rotation" output, a VEC2 "NORMAL") returns a `gltf.accessor-type-mismatch` fault the caller classifies
  by role (mandatory → Drop, optional → Recover-absent). Threaded to every consumer with its layout-fixed type.
- **bufferView-WINDOW bound** — base reads (`readAccessor`) and both sparse reads (`applyAccessorSparse`) now
  clamp to `min(bufferView.byteOffset + byteLength, buffer end)`, not just the buffer end. A POSITION needing
  36 bytes through a declared 4-byte view now faults (`gltf.accessor-past-buffer`) instead of reading 32 bytes
  of unrelated buffer.
- **sparse DESTINATION-INDEX bound** — `applyAccessorSparse` pre-scans indices; a sparse index ≥ accessor.count
  (a silently-ignored typed-array write) skips the whole override and keeps the base → `gltf.sparse-index-out-
  of-range` Recover.
- **animation input/output ROLE type** — input must be SCALAR; output type by path (rotation VEC4,
  translation/scale VEC3, weights SCALAR) via `GLTF_ANIMATION_OUTPUT_TYPES`; a mismatch drops the channel.

VALIDATION CENSUS (accessor consumer × type-validated × window-bounded × fault→role) — every cell closed:
**SUPERSEDED 2026-07-29 — this table's "every cell closed" was false; its AXES were wrong. See the
2026-07-29 read-geometry entry at the top for what it missed and why. Kept as written for the record.**
| consumer | expected type | type✓ | window✓ | fault → role |
| --- | --- | --- | --- | --- |
| primitive POSITION | VEC3 | ✓ | ✓ | count0/fault → primitive Drop |
| NORMAL / TANGENT / TEXCOORD_0 | VEC3 / VEC4 / VEC2 | ✓ | ✓ | fault → Recover, absent |
| JOINTS_0 / WEIGHTS_0 | VEC4 / VEC4 | ✓ | ✓ | fault → Recover, unskinned |
| primitive indices | SCALAR | ✓ | ✓ | fault → primitive Drop |
| skin inverseBindMatrices | MAT4 | ✓ | ✓ | fault/short → identity Recover |
| animation input (times) | SCALAR | ✓ | ✓ | fault → channel Drop |
| animation output | VEC4/VEC3/SCALAR by path | ✓ | ✓ | fault → channel Drop |
| morph POSITION delta | VEC3 | ✓ | ✓ | fault → target/whole-morph Drop |
| morph NORMAL / TANGENT delta | VEC3 | ✓ | ✓ | fault → Recover, absent |
| sparse index/value reads | — | n/a | ✓ | past-window → Recover, skip override |
| sparse destination index | < accessor.count | ✓ | n/a | out-of-range → Recover, skip override |
| image bufferView slice | — (bytes) | n/a | ✓ (`Uint8Array.slice`) | short → decoder handles |
| GLB chunk reads | — (bytes) | n/a | ✓ (header/length guards) | — |
Four more regressions (VEC3-rotation type Drop, optional wrong-type Recover, sparse-index-out-of-range Recover,
bufferView-window overrun Drop). scene-formats 504/504 (gltfParse 123/123), npm run check exit 0.

**AWD skeleton-binding / multi-skeleton — DECIDED DEFERRED NON-GOAL (user-pinned 2026-07-25).** Not
"blocked awaiting a multi-skeleton .awd + animator-block spec" — it is deferred because AWD is a legacy
format and there is no multi-skeleton AWD corpus to hold an implementation honest. A multi-skeleton file
binds all skinned meshes to the first skeleton (see the 2026-07-17 entry). Revisit ONLY if a real
multi-skeleton asset appears; do not resurrect it speculatively.

## 2026-07-24 — AWD2 materials import as ShadedMaterial (builder, user-directed review-bed46182/7062769f)

`resolveAwdMaterial` now emits a **ShadedMaterial** (was BlinnPhongMaterial), UNIFORMLY — including a
method-less material (empty `modifiers[]`). The durable WHY is in the resolveAwdMaterial doc comment (AWD's
MethodMaterial = BlinnPhong base + method array ≅ ShadedMaterial base + modifier stack; empty stack compiles
to the same base program, stays lossless if methods appear, lets a demo author append a modifier without a
kind conversion — do NOT collapse to BlinnPhong). scene-formats gains a `@flighthq/shading` dependency
(`createShadedMaterial`). Base props mapped: color(1)→diffuse, diffuseTex(2)→diffuseMap, normalTex(3)→normalMap,
**alpha(10)→ folded into diffuse RGBA + alphaMode='blend' when < 1** (new). A method-bearing material
(numMethods > 0) **warns via the diagnostics seam and imports the base only**. scene-formats 395/395, full
`npm run check` exit 0.

**Empirical findings that reshaped the parcel's rules (dumped the real material blocks):**
- The parcel listed "specular color, gloss→shininess, ambient" as base properties to read. **They are NOT
  base properties in real AWD2 files.** Every material in the corpus carries only props {1:color, 2:diffuseTex,
  [3:normalTex], 10:alpha(f32), 11/13:bool flags, 12:unused baddr}. In Away3D's model specular/gloss/normal/
  env/fog are **METHODS**, not base props — which is exactly why `numMethods` is the hinge. So there is nothing
  to read for specular/gloss/ambient on the base; ShadedMaterial's specular/shininess stay at defaults.
- **The method→modifier WALK is deferred, not built.** The whole reference corpus is `numMethods == 0`, so the
  AWD2 method-block byte layout can't be observed or tested in-sandbox; shipping a blind walk would be
  speculative (violates the honest-parse mandate). Instead: read `numMethods`, warn when > 0, leave method
  bodies unwalked. When a real method-bearing AWD2 file + the verified method-type spec are available, the
  walk + Fog/EnvMap/fresnel/soft-shadow→modifier mapping gets built and tested properly. Surfaced to review.

**Still open (example-side, not importer):** an AWD-loading example must `registerBuiltInModifiers` + register
the shaded mesh renderer (not just the BlinnPhong renderer) now that AWD meshes carry ShadedMaterial. No AWD
example exists in-repo yet; note carried for whoever builds it.

## 2026-07-24 — AWD → AWD2: API/file split, version guard, compressed-animation fix, real-corpus verify (builder, user-directed)

The AWD importer is now explicitly **AWD2** end-to-end, reserving the bare `Awd3` namespace for the
future AwayJS SceneGraph (version-3) parser.

**API split (user-ratified).** Renamed the public surface: `parseAwd`→`parseAwd2`,
`createScene3DFromAwd`→`createScene3DFromAwd2`, `parseAwdSkeletonAnimations`→`parseAwd2SkeletonAnimations`,
`registerAwdDecompressor`→`registerAwd2Decompressor`, `registerAwdDeflateDecompressor`→
`registerAwd2DeflateDecompressor`; internal `AWD_*` schema consts → `AWD2_*` (incl. `AWD2_TANGENT_HANDEDNESS`).
The `@flighthq/types` `AwdDecompressor` type stays version-neutral (a payload-in/bytes-out contract a future
AWD3 parser reuses). **Files renamed** (user request) `awdParse`→`awd2Parse`, `awdSchema`→`awd2Schema`,
`awdInflate`→`awd2Inflate` (+ tests). scene-resources `awdLoad.ts` filename left as-is (cross-package; the
symbol import was updated) — SUGGEST renaming to `awd2Load.ts` for consistency.

**Version guard.** `parseAwd2`/`parseAwd2SkeletonAnimations` now validate the header version-major byte
(offset 3) after the magic: accept 2, else warn + return empty, naming AWD3 explicitly as a recognized but
not-yet-implemented future format. Previously only the magic was checked, so a version-3 file (the whole
awayjs-examples AWD3 folder is v3) silently misparsed under the AWD2 block walk.

**Compressed-animation BUG FIXED (found via real corpus).** `buildAwdDocumentAnimations` was re-walking the
original `bytes` (still-deflated for a compressed file) instead of the rehydrated `source`, so **skeleton
animations were silently dropped for every deflate-compressed AWD** — Away3D's export default — while the
mesh/skin (walked from `source`) still imported. Now walks `source`. Confirmed on onkba.awd: 0 → 5 clips.
Regression-tested with a stub decompressor (no `node:zlib` at build time).

**Real-corpus verification bench (manual, not committed).** Ran the four review-named AWD2 assets end-to-end
(parse → Scene3DDocument → createScene3DFromAwd2). All parse with **0 warnings**:
- PolarBear.awd — v2, uncompressed, skeletal: skin 31 joints, 3 clips (Breathe 62 channels).
- onkba.awd — v2, deflate, skeletal: skin 40 joints, 5 clips (post-fix).
- tictac.awd — v2, deflate: 13 textured materials.
- MonsterHead.awd — v2, deflate: 1 material (4.7 MB, texture-heavy; no morph blocks present).
Block types exercised: 1 geometry, 22 container, 23 mesh-instance, 81 material, 82 texture, 101 skeleton,
102 pose, 103 skeleton-animation, **255 (namespace/metadata — unknown to the parser, skipped gracefully,
no corruption)**. No other core-namespace block types appear in the corpus.

**numMethods empirics (reported to review).** EVERY material in the corpus has **numMethods == 0**
(tictac ×13, MonsterHead ×1; all matType=2 texture). ⇒ the Away3D demos store NO shading methods in-file;
their fog/fresnel/env effects were attached at AS3 runtime by the example, not by the importer. This tells
the *example* author what to wire, not the importer.

### AWD3 — deferred format (chartered, not implemented)

AWD3 is the AwayJS **SceneGraph** binary (version 3): a different block model from AWD2 (shapes, timelines,
textfields, scripts, sounds — a 2D display/timeline authoring format, not just a 3D mesh container). It is
**recognized-and-rejected** by the AWD2 version guard, not misparsed. Unnecessary for current demos; ranks
below other unbuilt 3D importers (e.g. FBX). Building it is a separate future charter that will own the bare
`Awd3`/`createScene3DFromAwd3` namespace the AWD2 rename freed. Sample corpus: awayjs-examples `src/assets/AWD3/`.

### NEXT CHUNK — AWD2 materials as ShadedMaterial (user-directed, review-bed46182; NOT yet done)

Rule (final, overrides an earlier numMethods-conditional draft): import AWD2 materials as **ShadedMaterial
uniformly** — honest to the material *model* (AWD material == AwayJS MethodMaterial == BlinnPhong base + method
stack; ShadedMaterial is the Flight type whose range matches, BlinnPhong is a lossy projection). A method-less
material → ShadedMaterial with an empty modifier stack (same base program/pixels). TODO:
1. Read the FULL base PropertyList onto the ShadedMaterial base: diffuse, specular color, gloss→shininess,
   ambient, + diffuse/normal/specular maps (parser currently reads only diffuse color + diffuse/normal tex).
2. Read `numMethods` and walk the method blocks (tail currently unread); map known methods to modifiers
   (Fog→FogModifier, EnvMap→EnvReflect, fresnel-specular→fresnel [may need a new modifier — flag],
   soft-shadow→pcf/shadow config); WARN via the diagnostics seam on any unmapped method, never silent-drop.
3. Wiring cost (accepted, eyes-open): AWD meshes then render through the shaded assembly, so an AWD-loading
   example must `registerBuiltInModifiers` + the shaded mesh renderer, not just the classic BlinnPhong
   renderer. Note this in the importer doc comment + here. Method-less consumers can down-convert themselves.
4. DOC THE RATIONALE in the importer doc comment (durable architectural note, review-7062769f) — the WHY,
   not just the how, as the guard against a future agent seeing all-zero numMethods and reverting to a
   conditional BlinnPhong: "AWD materials import as ShadedMaterial UNIFORMLY — including numMethods=0 (empty
   modifiers[]). AWD's material model is a MethodMaterial = BlinnPhong base + a METHODS ARRAY; ShadedMaterial
   (base + ordered modifiers[]) is its structural image. An empty stack honestly encodes a method-less
   material and compiles to the same base program as BlinnPhong (zero pixel cost), while (a) preserving
   losslessness if any file/exporter DOES carry methods, and (b) letting a demo author reproduce the original
   Away3D look by APPENDING a fresnel/fog modifier — no material-kind conversion. Do NOT collapse method-less
   materials to BlinnPhong: that discards the format's array-shaped intent to save a type."

## 2026-07-24 — md2/md5/awd/3ds parser-maturity pass (builder, per-chunk attested + reviewed)

Correctness + major features + breadth landed this session (each its own commit, attested):

- **MD2**: restored the canonical 162-entry Anorms table (the committed table had **129 scrambled tail
  entries** + 2 missing → corrupt normals; now byte-exact vs `anorms.h`, warns on out-of-range indices).
  Frame-name **animation segmentation** — contiguous same-prefix frame runs become N named morph clips.
- **MD5**: bind position now baked from the **same top-4 renormalized** influence set the skin stores
  (was all-influences → disagreed with joints0/weights0 for >4-influence verts); warns on truncation.
  Added **`importMd5Mesh(meshSource, animSource?)`** one-call composer over parseMd5Mesh + parseMd5Anim.
- **AWD**: tangent.W bitangent handedness now written (was 0 → broke normal mapping); sign derived
  analytically as `-1` — **needs a builder2 shambler render-proof to confirm chirality** (flip the one
  `AWD_TANGENT_HANDEDNESS` constant if bumps invert). **Compression support**: swappable
  `registerAwdDecompressor` seam + vendored dependency-free sync DEFLATE/zlib inflater
  (`registerAwdDeflateDecompressor`), tree-shakable — closes the "compressed AWD imports as nothing" gap.
- **3DS**: per-face **material subsets** (MSH_MAT_GROUP face-index list → one MeshSubset per material) +
  **smoothing-group normals** (SMOOTH_GROUP, vertex-split at hard edges). Material breadth: shininess
  (0xA040 → specular exponent), bump (0xA230 → normalMap), transparency (0xA050 → alpha + blend).

**Parked gaps (review-ruled, not parser fixes):**
- **Opacity texture MAP** MAT_OPACMAP `0xA210` is left unread — BlinnPhongMaterial has no
  `opacityMap`/`alphaMap` field, and adding one is a cross-package feature (types + scene-gl/scene-wgpu
  alpha-map sampling + functional proof), not parser breadth. The same pending question applies to **AWD
  and glTF alpha maps**. Scalar transparency already covers the common case honestly.
- **Bump/height MAP** MAT_BUMPMAP `0xA230` is parsed into `ThreeDsMaterial.bumpFilename` as metadata but
  **not bound to a material** — it is a legacy grayscale HEIGHT field, not a tangent-space normal map, so
  binding it to `normalMap` (sampled as RGB*2-1) would render bogus vectors (three.js TDSLoader keeps
  bumpMap distinct from normalMap for the same reason). An honest bump→normal seam / a `bumpMap` material
  field is the same cross-package renderer feature as the alpha maps above.

Both await a user direction ruling before becoming a scoped dispatch (types → renderer → parsers). The
3DS FACE_MATERIAL subset-split gap below is now **done** (this pass).

## 2026-07-19 — AAA depth follow-ups recorded (doc-honesty stage)

Known parser depth gaps, parked here rather than as inline TODOs:

- **3DS FACE_MATERIAL per-face subset splitting.** `parseTriMesh` (threeDsParse.ts) reads FACE_MATERIAL
  sub-chunks but keeps only the material *names* — it discards the per-material face-index list each
  sub-chunk carries, so a mesh with multiple materials is imported as one undifferentiated geometry
  instead of split into per-material subsets (mirroring the OBJ `usemtl` subset path). AAA: split faces
  into subsets keyed by FACE_MATERIAL, one draw range per material.
- **glTF KHR_materials_emissive_strength.** `gltfParse.ts` never reads the extension; the scene-gl
  material renderers already honor an `emissiveStrength` uniform, so importing it would light emissive
  materials correctly (values > 1 drive bloom). Currently every imported material lands at strength 1.
- **glTF non-triangle primitive modes.** `primitiveToGeometry` warns and imports points/lines/
  strips/fans "as-is" (mode ≠ 4). AAA: convert triangle-strip/fan/line-strip/-loop into the canonical
  triangle-list layout so non-triangle primitives render, rather than passing indices through unchanged.

## 2026-07-17 — AWD skinning wired; shared skin-emit seam across all 3 skeletal formats (builder, reviewed)

`createScene3DFromAwd` now emits `joints0`/`weights0` + parses the skeleton block + sets `mesh.skin`
(joints reachable as `mesh.skin.skeleton.joints`), reaching parity with MD5 and glTF. The "one emitter"
seam is now real: a shared **`packSkinInfluences`** primitive in `shared.ts` (top-4-by-weight +
renormalize; `SKINNED_FLOATS_PER_VERTEX`); **MD5 refactored onto it (dropped its duplicate)**, glTF
shares the constant. scene-formats 165 tests + `npm run check` green; verified against the real
`shambler.awd` end-to-end (structurally).

Decoded AWD skin streams empirically: stream type 6 = joint indices as **uint16 even though the stream's
declared type byte says float32** (read by byte length regardless — documented + fixture-asserted);
stream type 7 = float32 weights. shambler carries 8 influences/vertex (1104/3876 verts >4), so top-4
renorm is mandatory.

**BREAKING (intra-package):** `parseAwdSkeletonAnimation(bytes, joints, warnings) → AnimationClip` — now
MD5-symmetric, binds channels to the caller's joints so anim/skeleton/skin share ONE hierarchy (was
`{clip, skeleton}`; only its own tests called it). App flow: `scene = createScene3DFromAwd(bytes)` →
find skinned mesh → `parseAwdSkeletonAnimation(bytes, mesh.skin.skeleton.joints)`. Flag for downstream
(flight-reference) AWD usage.

**Needs host visual gate (unverifiable in-sandbox):** the skinned *render* (shambler deforming), and
specifically **animated deformation correctness** — the AWD joint matrices are kept in the existing
local-transform interpretation; static bind pose renders correctly (bind skin = identity) but
local-vs-inverse-bind under animation can only be confirmed visually (fix localized if wrong). Also:
multi-skeleton AWD binds all skinned meshes to the first skeleton (warns); AWD anim drives translation
only (pre-existing).
