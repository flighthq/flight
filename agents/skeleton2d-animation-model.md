# Skeleton2D Animation Model — slot timelines, and where constraints live

**Status: PROPOSAL, not a decision.** Written by builder2 at chief's request alongside the named-skins landing, so option (b) can start the day it is approved instead of idling. Nothing here is implemented. Chief rules on both questions together.

Read this before extending `Skeleton2DAnimationPath`, adding a non-bone timeline, or deciding where constraint solvers belong.

## Where the model stands today

`Skeleton2DAnimationPath` is `Translation | Rotation | Scale | Shear` — four **bone transform** groups. `Skeleton2DAnimationTarget` is `{ boneIndex, path }`, carried as an `AnimationChannel`'s opaque `targetRef`, and `applyAnimationClipToSkeleton2D` composes each sampled value onto the setup bone (add for translate/rotate/shear, multiply for scale).

That covers every **bone** timeline in Spine and DragonBones, and all three parsers now emit it. What it does not cover is everything the two formats animate that is *not* a bone transform. Measured on the licensed spineboy rig: slot **colour** timelines (6 in `shoot` alone), slot **attachment-swap** timelines (6 in `shoot`), and **draw order**. All are currently consumed-and-Skip-crumbed by the importers.

## (b) Slot colour and attachment-swap timelines

### The crux: these are two different problems, not one

They are usually named together, but they fail for opposite reasons, and conflating them is how this gets designed badly.

**Slot colour is numeric and already fits.** `Slot2D.color` is a packed RGBA integer; an animated colour is 4 channels of 0..255. `AnimationTrack` interpolates numbers and already supports Step and Linear. Nothing about the *track* needs to change — only the **target**, because a colour timeline drives a slot, and `Skeleton2DAnimationTarget` can only name a bone.

**Attachment swap is not numeric at all.** It is a step function over *discrete attachment identities* — "show `muzzle01`, then `muzzle02`, then nothing". `AnimationTrack.values` is `ArrayLike<number>`; there is no representation for a string or an object reference, and interpolating between two attachments is meaningless. This is a genuine model gap, not a plumbing gap.

### Decision 1 — how a channel names a slot

- **Option 1a — widen `Skeleton2DAnimationTarget`** to a tagged target (`{ index, kind: 'Bone' | 'Slot', path }`). One target type for everything. Costs a migration of every existing channel and the binder's dispatch, for a rig shape that is already shipped and verified.
- **Option 1b — add a second target type**, `Skeleton2DSlotAnimationTarget { slotIndex, path }`, with its own small path vocabulary. `targetRef` is typed `unknown` precisely so the binding layer can interpret more than one shape, and the binder already probes it (`typeof target.boneIndex === 'number'`) rather than assuming. Purely additive: no existing channel, test, or parser output changes.

**Recommendation: 1b.** It is additive, it uses the seam `targetRef` was designed for, and it keeps each target *precise* rather than making every bone channel carry a discriminator it does not need. The cost — two target types instead of one — is the honest shape of the domain: a bone target and a slot target genuinely address different arrays.

### Decision 2 — how an attachment swap is carried

- **Option 2a — a discrete/non-numeric track in `@flighthq/animation`.** Widens `AnimationTrack` (or adds a sibling) to carry arbitrary values. Cross-package, and it taxes every track in the SDK to serve one 2D-skeletal feature. Same shape as the per-component-easing option chief already declined, and it should be declined for the same reason.
- **Option 2b — keep swaps out of `AnimationClip` entirely**, as a separate per-slot keyframe list on `Skeleton2DImportAnimation`, applied by its own skeleton2d function. Honest, but it splits one animation across two playback mechanisms: a caller would have to advance a clip *and* a second structure, and a mixer could blend one but not the other.
- **Option 2c — encode the swap as a numeric INDEX track plus a lookup table on the target.** The track is Step-interpolated with integer values; the target carries the attachments those indices name. `-1` means "show nothing", which is exactly what Spine writes when a keyframe has no attachment name (spineboy's `shoot` does this to hide muzzle flashes).

**Recommendation: 2c.** It needs no change to `@flighthq/animation` at all, reuses Step interpolation as-is, and keeps the whole feature inside skeleton2d where the domain knowledge lives. The lookup table is plain data hanging off the target — the same "opaque `targetRef` interpreted by the domain layer" pattern already in use. It also ports cleanly: an index plus a table is a C-friendly shape, where a discrete-value track is not.

The one wrinkle to state plainly: an index track **must** be Step, and a caller who forces Linear on it would interpolate *between table indices*, which is nonsense. That is a real sharp edge and wants a guard — the binder should treat any non-Step attachment channel as Step regardless of what the track claims, rather than trusting it.

### What this proposal does NOT cover

**Draw-order timelines.** Reordering slots is a different operation again — it mutates the draw list, not a value on a slot — and it interacts with whatever eventually owns 2D draw order. Deliberately left out; it should be its own question once slot animation lands.

**Dark colour.** Spine's second (dark) slot colour has no representation in `Slot2D` at all. Adding slot-colour animation does not require solving it, but it will look like an omission, so it should be named as deferred rather than silently skipped — the same call already made for DragonBones' additive slot offsets.

## (c) Where do IK / transform / path constraint solvers belong?

The charter places them in **skeleton2d P2**, and for IK and transform constraints that still looks right: they are pose math over bones, they need nothing but the bone array and the world-transform pass, and they belong with the code that owns the pose. Nothing has changed to move them.

**Path constraints are the exception, and the reason is a dependency, not a concept.** A path constraint positions bones along a vector path, so a solver needs `@flighthq/path` — which `@flighthq/skeleton2d` does not depend on today (its deps are `animation`, `entity`, `geometry`, `math`, `types`). Putting path constraints in skeleton2d pulls the whole path kernel into every rig that never uses one, which is exactly the "an assembly never taxes the primitive" rule. The alternative is the focused-neighbour-package pattern AGENTS already blesses (`@flighthq/spritesheet-formats` beside `@flighthq/spritesheet`): IK and transform constraints stay in skeleton2d P2, and path constraints become a small separate cell that depends on both skeleton2d and path. **Recommendation: keep P2 as the home for IK and transform; split path constraints out rather than importing `path` into the core.**

## If approved, the build order

1. `Skeleton2DSlotAnimationPath` + `Skeleton2DSlotAnimationTarget` in `@flighthq/types`; extend the binder to dispatch on target shape.
2. Slot **colour** end to end — the easy half, and it validates the new target with no model risk.
3. Attachment **swap** as the index-plus-table track, with the Step guard.
4. Parsers: Spine `.json`, Spine `.skel` (both already *consume* these timelines — the record layouts are decoded and verified, only the mapping is missing), then DragonBones.

Step 4 is cheaper than it sounds: the binary decoder already walks the slot colour and attachment timelines byte-exactly, so nothing has to be reverse-engineered — the bytes are being read and thrown away today.
