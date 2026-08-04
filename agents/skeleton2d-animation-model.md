# Skeleton2D Animation Model — non-bone timelines, and where constraints live

**Ruled 2026-08-04**, superseding the 2026-08-02 proposal of the same name. That proposal framed the
domain as "bone timelines, plus two missing things," recommended a second target *type* and a silent
interpolation override, and recorded draw order as an open question. All three are corrected below.
Its constraint-placement section survives, with its bundle argument demoted to a measurement.

Read this before extending `Skeleton2DAnimationPath`, before adding any non-bone timeline, before
placing a constraint solver, and before adding a vertex-offset (deform) timeline.

## The domain is eight families, not two

The Spine binary parser already walks — and discards — every one of these:

> slot attachment, slot colour, IK, transform, path, deform, draw order, event

They are decoded field-for-field and `Skip`-crumbed today, so nothing here has to be
reverse-engineered; only the mapping is missing. Sizing the domain at two families is what produced
the wrong answer to target dispatch, so state the eight up front.

Measured on the licensed spineboy rig, `shoot` alone carries 6 slot-colour and 6 attachment-swap
timelines.

## Ruling 1 — a channel names its target by `kind`, through a registry

`AnimationChannel.targetRef` is typed `unknown` so the binding layer can interpret more than one
shape. Today `applyAnimationClipToSkeleton2D` interprets it by **structural probe**:

```ts
if (typeof target.boneIndex !== 'number') { … }
```

That is fine for two shapes and wrong for eight: it becomes an order-dependent `typeof` chain where
adding a family means editing one central function and getting the precedence right by inspection.
A hand-rolled tagged union (`{ index, kind: 'Bone' | 'Slot', path }`) fails the other way — it is the
closed union this codebase's own rule says to revisit on growth, and this family is already grown.

**Every target carries a `kind` string and the binder dispatches through a registry**, the same
mechanism renderers, effects, decompressors and node kinds already use:

```
'Skeleton2D.BoneTarget' | 'Skeleton2D.SlotTarget' | 'Skeleton2D.ConstraintTarget' | …
```

Vendor-prefixed customs are therefore possible, an unused family tree-shakes out, and adding the
seventh target touches no existing code. The cost is honest and paid once: the shipped bone target
gains a `kind` field. Pay it now rather than at family six.

This replaces both options in the superseded proposal. Do not build a second bare target type, and
do not widen the existing one into a discriminated union.

## Ruling 2 — attachment swap is a Step index track plus a lookup table

The track carries integer indices, Step-interpolated; the target carries the attachments those
indices name. `-1` means "show nothing", which is exactly what Spine writes for a keyframe with no
attachment name (spineboy's `shoot` hides muzzle flashes this way).

**The reason is seekability, not convenience.** The superseded proposal justified this as "needs no
change to `@flighthq/animation`", which is true but is an implementation argument. The real one: a
track answers *what value is in effect at time t*, statelessly and in O(log n), which is precisely
the attachment query — scrub to mid-animation and the correct attachment is the last swap at-or-before
that time. Nothing else about the model has to change for seeking to be right.

Widening `AnimationTrack` to carry non-numeric values is **declined**: it taxes every track in the SDK
to serve one 2D-skeletal feature, the same shape as the per-component-easing option already declined.

### The sharp edge, and how it is reported

An index track **must** be Step. A caller who forces Linear would interpolate *between table indices*,
which is nonsense. The binder therefore treats an attachment channel as Step regardless of what the
track claims — **and says so through `enableSkeleton2DGuards`, with a matching `explain*`.** Silently
overriding caller data is the failure the diagnostics inversion rule exists to prevent: coercing is
correct, coercing invisibly is not.

## The track-vs-cue line

Attachment swap and events are the two halves of this distinction, which is why they are named
together:

- **A track answers "what is in effect at time t."** Seekable, stateless, interpolated (or Step).
  Slot colour, attachment swap, bone transforms.
- **A cue answers "what fired between t0 and t1."** Edge-triggered, order-dependent, not meaningful
  to sample. Events.

Events are therefore **cue-shaped and governed by [timeline cue model](timeline-cue-model.md)**, not by
this document — `Skeleton2DImport` carries no event vocabulary today and `spine.event-unsupported` is
crumbed for them. Choose by which question the data answers, not by which mechanism is closer to hand.

## Ruling 3 — draw order is not blocked

The superseded proposal deferred draw-order timelines as interacting with "whatever eventually owns 2D
draw order." That owner exists: [draw order model](draw-order-model.md) — child order is the only
order, ordering is a caller-owned `NodeOrderList`, never node state. **Rive already ships against it**,
importing `DrawRules`/`DrawTarget` through `NodeOrderList`.

A Spine draw-order timeline binds to the same structure and is Rive's second consumer. It is ordinary
work, not an open question.

## Ruling 4 — constraint placement

**IK and transform constraints live in `@flighthq/skeleton2d`.** They are pose math over bones, need
nothing but the bone array and the world-transform pass, and belong with the code that owns the pose.
`Bone2D.length` is already documented as serving them.

Build them as a **registered solver family keyed by kind**, not a closed switch, so a rig using only IK
does not link the rest. Rive contributes `IKConstraint`, `TranslationConstraint` and neighbours (179
objects across 11 of 37 corpus files); Spine contributes IK, transform and path.

**Path constraints are the open case, and it is a measurement, not an argument.** A path constraint
positions bones *along* a vector path, so a solver calls `getPathLength`, `getPathPointAtDistance` and
`getPathContourLengths` — real `@flighthq/path` functions, which `skeleton2d` does not depend on today.
The superseded proposal concluded from this that path constraints must split into a neighbour package,
so the path kernel does not tax every rig.

That conclusion was never measured. `skeleton2d` declares `sideEffects: false`, so if the only path
imports sit in a module a consumer never imports, they should shake out and cost that consumer zero
bytes — **a `package.json` edge is not automatically a bundle cost.** Probe it with `npm run size`
against a consumer that uses only IK, then decide: kernel absent, keep path constraints in
`skeleton2d`; kernel present, split and record the number as the reason.

### The reusable distinction

Two operations touch a `Path` and they place differently:

- **Writing** coordinates into one — skinning a path — needs only the `Path` **type**, which lives in
  `@flighthq/types` and is free. This is why `PathAttachment2D` sits in `skeleton2d` with no new
  dependency.
- **Querying** one — arc length, point-at-distance — needs the path **kernel**, and is what raises the
  placement question at all.

## Slot colour

`Slot2D.color` is a packed RGBA integer and an animated colour is four 0–255 channels. `AnimationTrack`
already interpolates numbers with Step and Linear, so nothing about the *track* changes — only the
target, which Ruling 1 supplies. This is the low-risk half and should land first, validating the
target registry before attachment swap exercises it harder.

## Open — deform timelines, and they gate the deformer

Spine's deform timelines are per-vertex offsets layered **on top of** skinning. The superseded proposal
omitted them entirely, and they are the one family entangled with work already in flight: a deform
offset applies after the skinning pass, so where it enters the pipeline has to be answered **alongside
`deformSkeleton2DPathAttachment`, not after it**. Rive's `MeshVertex`/`ContourMeshVertex` and its
`CubicWeight` path vertices raise the same question from the other side.

Design this before the path deformer lands, or the deformer will be shaped without a seam it needs.

## Deferred, and named rather than skipped

**Dark colour.** Spine's second (tint-black) slot colour has no representation in `Slot2D`. It is a
second packed RGBA field beside `color`, not a model problem — deferred as scope, not as difficulty,
alongside the same call already made for DragonBones' additive slot offsets.

## Build order

1. Target `kind` + registry dispatch in `@flighthq/types` and the binder (Ruling 1).
2. Slot **colour** end to end — validates the registry with no model risk.
3. Attachment **swap** as the index-plus-table track, with the Step guard and its `explain*`.
4. Draw-order timelines onto `NodeOrderList`.
5. Parsers: Spine `.json`, Spine `.skel`, then DragonBones. Cheaper than it sounds — the binary decoder
   already walks these records byte-exactly and throws the values away.

Constraints (Ruling 4) and deform (Open) run on their own tracks and do not block this sequence.
