# Timeline Source Model — what is a dictionary, what is a sequence, and where playback lives

**Two statuses, deliberately separated.** Everything under "What is true today" is an **observation of
the code**, verified at `ad91479cb`; if a claim there no longer matches the tree, the doc is wrong and
should be corrected from source. Everything under "The proposal" is **unratified** and awaits the
timeline cell review — do not build from it.

Read this before adding a field to `SpritesheetAnimation`, before writing a new `TimelineSource`
producer, and before designing named frame ranges.

## What is true today (verified at `ad91479cb`)

### The distinction that resolves everything: what an index *means*

Two arrays in this domain are both "numbered frames", and they are not the same kind of thing.

```ts
export interface Spritesheet {
  atlas: TextureAtlas | null;
  animations: Record<string, SpritesheetAnimation>;
  frames: SpritesheetFrame[];
}
export interface SpritesheetFrame { id; offsetX; offsetY; pivotX; pivotY; rotated: boolean }
```

`SpritesheetFrame.rotated` records that a region was turned 90° **to pack tighter in the atlas**. That
is packing metadata, and it is meaningless in time. `Spritesheet.frames` is therefore a **dictionary of
regions addressed by slot**, whose order is whatever the packer chose. It is spatial.

`SpritesheetAnimation.frames` is `number[]` — indices *into* that dictionary, in play order. It is
dense, ordered, and free to revisit an index (`[0, 1, 2, 1, 0]` is legal). Revisiting is the proof:
on a timeline, position **is** time, so being at time 1 twice in one pass is meaningless. It is temporal.

**So a spritesheet animation is a timeline. The spritesheet is its content dictionary.**

This is the same split SWF already carries — a character dictionary, plus a timeline that places
characters — and it is the general shape of every frame-based format.

### The adapter already implements exactly this

`packages/movieclip/src/spritesheetTimelineSource.ts` sets `totalFrames: animation.frames.length` and
resolves content with `animation.frames[frame - 1]`. It treats the **animation** as the timeline and the
**sheet** as the dictionary. The architecture is right; only the vocabulary is misplaced (below).

It is also why selection *shape* is an input-side concern and not a constraint on any future named-range
design: a producer may hold a non-contiguous list, a contiguous span, or anything else, but
`TimelineSource` always presents a dense `1..N`.

### What each package owns

- `@flighthq/spritesheet` — atlas regions and named sequences over them. An **asset** concept.
  Depends on `entity`, `signals`, `textureatlas`, `types`. Does **not** depend on `timeline`.
- `@flighthq/timeline` — playback of a dense frame sequence. An **engine** concept.
  Depends on `signals`, `types`.
- `@flighthq/movieclip` — the display node, and the adapter that bridges the two. It depends on
  `timeline` but **not** on `spritesheet`; the bridge is typed entirely off `@flighthq/types`.

Neither of the first two is subordinate to the other, and `TimelineSource` is the contract between
formats and the engine — its own header names hand-authored keyframes, a spritesheet animation, and a
future imported SWF document as peers.

### The live defect this model explains

`createSpritesheetTimelineSource` silently drops three authored fields: `animation.direction` (so
`pingpong` / `reverse` / `pingpong_reverse` all play forward), `animation.repeatCount` (so a finite
repeat becomes whatever the consuming `Timeline.playMode` is), and `animation.frameDurations` (so a
variable-timed animation plays at the flat `frameRate: 1000 / animation.frameDuration`). No crumb, no
guard, no `explain*`.

The cause is not carelessness. **`TimelinePlayMode` is `'loop' | 'once'` and that is the entire
vocabulary** — there is no field for direction, none for a finite repeat, and `TimelineSource.frameRate`
is a single number with no per-frame form. The adapter author had nowhere to put these values.

Note the asymmetry: spritesheet expresses loop-vs-once as `repeatCount` (`-1` indefinite, `0` once),
which is strictly richer than the two-value enum, and `timeline` is the model every format must funnel
through.

## The proposal (unratified — pending the timeline cell review)

**The three dropped fields do not describe what the frames are. They describe how a sequence plays.**
That is the engine's domain, and they are currently declared in the asset package — which is exactly why
they cannot cross the seam.

So: **the playback vocabulary becomes canonical on the timeline side, and `spritesheet` references it
rather than declaring its own.** Because every exported type already lives in `@flighthq/types`, this
costs **zero new package edges** — no dependency is added in either direction.

Concretely, the review should decide:

1. Whether `TimelineSource` carries direction, repeat count, and per-frame durations.
2. Whether `TimelinePlayMode` survives at all, given `'loop'` is `repeatCount: -1` and `'once'` is
   `repeatCount: 0`. Two spellings of one idea is what produced the loss.
3. Whether `SpritesheetAnimationDirection` becomes the shared `TimelinePlayDirection`. Its four values
   are already the right set; only its home is in question.
4. Whether a spritesheet animation may carry **cues**. The adapter hardcodes `cues: []`, but
   "footstep on frame 4" is a thing sprite formats author, and it is a capability spritesheet can
   already express and currently cannot carry. Governed by
   [timeline cue model](timeline-cue-model.md).
5. Whether **named ranges** belong on `TimelineSource` beside `labels` — a label is a named *point*, a
   range is a named *span*. See the note below on naming.

### Explicitly not proposed

- **Merging the packages.** They own different things and both should stand alone.
- **`spritesheet` depending on `timeline`.** It would couple a lean headless asset package to the engine
  to solve a problem that is not a dependency problem. The adapter is already in the right place.
- **Forcing one selection representation.** A dictionary-indirecting list and a contiguous span are both
  valid producer-side shapes; `TimelineSource` normalizes them.

### A naming caution, recorded because it was already got wrong once

A named span was first proposed as `TimelineScene`, taken from SWF's `DefineSceneAndFrameLabelData`.
**"Scene" already means a display-graph world in this SDK** — `Scene2D`, `Scene3D`, `Scene2DDocument` —
so the name collides and imports one format's word wholesale. `TimelineRange` was the replacement
candidate. Whatever the review picks, it should not be "scene".

Related: a singular `getTimelineCurrent*` accessor for spans silently asserts that spans do not overlap,
which is true of SWF scenes (they tile the root timeline) and false generally.
