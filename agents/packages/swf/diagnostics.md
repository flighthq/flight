---
package: '@flighthq/swf'
updated: 2026-08-07
---

# swf — the import diagnostic contract

What a consumer of `@flighthq/swf`'s structured diagnostics may rely on. Written **before** the classifier
that reads it exists, because the alternative is two implementations that agree in substance and differ in
encoding — which is the same defect one layer down from the capability-vocabulary one.

The producer owns the shape; the consumer owns the requirements. This records what is settled.

## Collecting

Diagnostics are **collected during an import, never enumerated off a finished one.** Every public entry
takes an optional trailing sink:

```ts
const diagnostics = collectImportDiagnostics((sink) => {
  createScene2DFromSwf(bytes, sink);
});
```

There is no post-hoc query, and that is deliberate rather than an omission: a crumb is not retained on the
document, so the no-collector path allocates nothing and the ordinary import is untouched. A consumer that
wants diagnostics must wrap the call.

## What each severity means for a score

`ImportDiagnosticSeverity` is the outcome axis, and it maps onto the conformance outcomes as follows. The
mapping is the contract; the severity alone is not enough for two of the four rows.

| Severity | What the importer did | Conformance reading |
| --- | --- | --- |
| `Skip` | A recognised-but-unsupported feature was ignored | **Unsupported, cleanly reported — correct behaviour, not a failure.** Never weight it as a miss |
| `Reject` | The whole input was refused and a sentinel returned | Usually a real refusal — **with one standing exception, below** |
| `Drop` | Data was lost | Needs the oracle: the import succeeded but is missing something |
| `Recover` | Degraded but continued with a substitute | Needs the oracle: the import succeeded and differs from the source |

**The standing exception: `swf.no-decompressor-registered` is `Reject` and reads as *unsupported, cleanly
reported*.** The severity is correct — the input genuinely was refused — but the missing capability is the
caller's codec registration, not the importer's correctness. The test that makes this principled rather
than convenient: registering an LZMA decompressor would make those files import with **no change to this
kind or its severity**. Its `detail` carries `compression`, so a consumer can bucket by codec.

## Identity

A diagnostic is identified by `kind` — a stable dotted string, `swf.`-prefixed, colocated at its drop
site. **There is no central list of kinds and there must not be one**: the seam's owner states that a
registry drifts and preserves stale "cannot do X" claims after X is built, so removing a drop branch is
the only thing that removes its kind.

`origin` names the function that actually emitted it, which is the true drop site rather than the public
entry the caller invoked.

### The join key, and where it is deliberately absent

Where a diagnostic corresponds to a **declared capability**, `detail.capability` carries that capability's
`id` from [capabilities.json](capabilities.json). That is the join key: a consumer keys the index on
capability id and can match crumbs to it without building a kind→capability map of its own — which would
be the forbidden central registry arriving by the back door.

**It is deliberately partial.** Container rejections name no capability at all, and several declined tags
(`DefineFont4`, `DefineBinaryData`, `ImportAssets`, `DefineButtonSound`) have no declared capability
either. Inventing ids so that every crumb could carry one would put entries in the denominator that
nothing measures. **Absence of `detail.capability` means "this loss is not a declared capability", not
"unknown".**

## The hard one: what silence means

An empty diagnostic list means **both** "nothing was lost" and "something was dropped without a crumb".
That ambiguity is the whole distinction the conformance work exists to draw, so it cannot be left to
inference.

**Silence is only trustworthy where a drop site has been wired.** The honest formulation is a property of
the *instrument*, not of the import:

- For a capability whose loss paths all report, **no crumb naming it means it was not lost.** Combined
  with an index entry saying the fixture exercises it, that is a pass.
- For a capability whose loss paths are **not yet wired**, silence carries no information at all. The
  correct reading is **unknown** — not pass, and not silently-wrong.

Scoring silence as a pass across the board would manufacture exactly the false assurance the three-number
reporting rule exists to prevent, and it would do it with every number true.

So the third state applies one level down: **pass · fail · unknown-because-the-instrument-is-blind-here.**
A consumer must not collapse the third into either of the first two.

### Which capabilities have trustworthy silence

Wired so far, and therefore safe to read silence for:

| Capability | Reported by |
| --- | --- |
| `swf.video.video-frame` | `swf.video-frame-payload` |
| `swf.placement.clip-depth` | `swf.mask-without-geometry` (a mask that resolves to no region) |
| `swf.axis.sound-format-non-mp3` | `swf.stream-sound-format` |
| `swf.shape.define-shape`, `-2`, `-3`, `-4` | `swf.shape-body-unreadable` |

Every other declared capability is **not yet wired**, so silence about it is uninformative today. This
table grows as drop sites are wired; it is the list a consumer should read rather than assuming coverage.

## Metadata silence is deliberate

Tags carrying no scene content — `FileAttributes`, `Metadata`, `ProductInfo`, `ScriptLimits`, `DebugID`,
`EnableDebugger2`, `EnableTelemetry`, `Protect`, `SetTabIndex`, `DefineButtonCxform`, and the font
hinting/naming tables — are read past and report **nothing**, on purpose. A document is not worse off for
skipping them, and reporting them would bury the entries that mean something under noise a consumer has to
filter. A colocated test asserts the silence, because the silence is the load-bearing half.
