**Two populations, reported side by side and never collapsed.** A fire proof and a silence proof license
*different* guarantees, each underwriting one of the two outcomes this work exists to distinguish:

| Population | Count | What it licenses |
| --- | --- | --- |
| Wired | **27 of 82** | every loss path for the capability reports |
| **Fire-proven** | **27 of 82** | *"silence here means nothing was lost"* — needed to detect **silently wrong** |
| **Silence-proven** | **27 of 82** | *"a firing here means something really was lost"* — needed to trust **unsupported, cleanly reported** |

**Say the smaller number plainly.** A reader entitled to know how many capabilities can **detect** a loss
is equally entitled to know how many have been shown not to **invent** one. They are currently equal;
when they diverge again, the smaller one is the honest headline.

Silence proofs were prioritised by **which capabilities actually emit a crumb on a corpus**, because a
fire-proof-only capability yields a verdict when it stays quiet and UNKNOWN the moment it speaks — so
silence proofs pay off exactly where crumbs appear. **That subset is corpus-relative: it is a fact about
the sample it was measured on, not about SWF, and a fixture-release bump invalidates the prioritisation.**
Re-derive it rather than assuming it stable. Every wired capability now carries both proofs, so the
ordering has nothing left to sequence — but it is the reason the two that fire on a thousand files were
proven before the six that fire on none.

A silence proof matters sooner than "crumb quality" suggests: **a capability with a fire proof and no
silence proof returns UNKNOWN the moment it actually reports something**, because a crumb is
uninterpretable without one. The fire-only capabilities are licensed for the no-crumb case alone.

**A silence proof is vacuous unless the capability was genuinely exercised** — silence because the feature
was absent proves nothing about the wire. Each silence test here pairs its absence assertion with a
positive check that the construct really was imported. The first run of these caught its own fixture
naming a character the file never defined, which is exactly the failure the pairing exists to prevent.

A single "instrumented" number would have to pick one of these and hide the other, which is the same
defect as a denominator that does not describe the population it claims. The machine-readable form is
[instrumentation.json](instrumentation.json), generated with a drift gate: every proof must name a test
that exists, so a renamed or deleted test breaks the build rather than silently degrading the mapping.

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
| `Drop` | Data was lost | Needs the reference-image: the import succeeded but is missing something |
| `Recover` | Degraded but continued with a substitute | Needs the reference-image: the import succeeded and differs from the source |

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
| `swf.bitmap.define-bits-jpeg-3`, `-4` | `swf.jpeg-alpha-stream` (the discarded alpha block) |
| `swf.bitmap.define-bits-jpeg-tables` | `swf.jpeg-tables-missing`, `swf.jpeg-tables-unsplittable` |
| `swf.timeline.define-scene-and-frame-label-data` | `swf.scene-names` |
| `swf.script.do-action` | `swf.frame-script-declined` |
| `swf.font.define-font`, `-2`, `-3` | `swf.font-glyph-outline` (one glyph), `swf.font-glyph-table` (the whole font) |
| `swf.placement.filter-list` | `swf.filter-field-unrepresentable` (a gradient glow's angle, distance, or placement) |

`swf.placement.clip-depth` has a second path: `swf.nested-mask-collapsed`, for the outer of two masks
covering one instance, which is not applied at all.

**An instrument has four independent properties, and a `fires`/`staysSilent` pair certifies only two:**

1. **Trigger correctness** — it fires when it should. Certified by the `fires` proof.
2. **Trigger specificity** — it does not fire when it should not. Certified by the `staysSilent` proof.
3. **Trigger scope** — the condition it tests is the whole of what can go wrong. **Not mechanised.**
4. **Payload validity** — what it records is true. **Not mechanised.**

They are independent, and this cell has produced a specimen of a (3) failure and a (4) failure. Property
(3) is found only by reading the claim against the code; property (4) by firing the instrument on a case
whose correct answer is already known and checking the record against it.

**An audit certifies a population at a moment, so coverage is recorded per capability rather than per
artifact.** Each row of [instrumentation.json](instrumentation.json) carries an `audits` list naming which
of properties (3) and (4) have actually reached it, and the root reports `scopeAudited` and
`payloadAudited` beside the two proof populations.

The reason is a near-miss: the scope audit covered sixteen claims, and `swf.timeline.frame-label` was
**created by that audit as its fix** and became the seventeenth — so it was never itself scope-audited,
and **the seventeenth arrived wearing the other sixteen's results**. It has since been audited separately
and holds. A count and its audit drift apart by default, and the drift is invisible because both numbers
stay true of *something*, just not of each other — staleness wearing a verification badge, which is the
most dangerous form because it looks like the thing that protects you.

**A capability enters this table only when *every* one of its loss paths reports — and that is a claim
worth auditing rather than assuming.** There is a third leg the proof mechanism cannot see: a fire proof
shows the wire fires **on the case you tested**, and a silence proof shows it stays quiet **on the case you
tested**. Neither shows that the tested case is **the whole of what the capability can lose**. Only reading
the claim against the code does that.

A scope re-audit of all sixteen existing claims found **two** false ones, both in capabilities that were
otherwise legitimately proven on both legs:

- `swf.timeline.define-scene-and-frame-label-data` claimed trustworthy silence while its wire covered the
  scene table only. A label naming a frame the timeline never reaches was filtered out with no crumb —
  now `swf.label-past-last-frame`, under the `swf.timeline.frame-label` capability it actually belongs to.
- `swf.placement.filter-list` covered a gradient glow's placement fields, while `BlurEffect` silently
  discarded an authored pass count. Now reported under the same kind, distinguished by `detail.field`.

A property-(4) audit of the **proof mapping itself** then found six capabilities whose `fires` proof named
a test that never built the tag they name — the shape wire proven on `DefineShape` alone while claiming
all four generations, the font wire on `DefineFont2` alone while claiming three, and JPEG4 claimed by
JPEG3's test. The shared code path almost certainly worked; what was untested was the **routing**, and a
proof that does not exercise the thing it names does not prove it. Each now has a proof that builds its
own tag and asserts its own capability id.
 Auditing it once already found a gap: the font rows claimed
trustworthy silence while covering only the per-glyph failure, so a font whose glyph table did not decode
at all vanished with no crumb, indistinguishable from a font that imported cleanly. `swf.font-glyph-table`
closes it. **A capability with two loss paths and one wire is worse than an unwired one**, because it
reads as covered.

**Silence is trustworthy at the granularity of the capability named, not of the tag that carried it.** A
`DefineShape4` whose geometry decodes but whose bitmap fill never resolves produces no
`swf.shape.define-shape-4` crumb, and correctly so — the shape capability worked. The loss belongs to
`swf.fill.bitmap`, which is **not** in this table. Do not read a shape row as "everything in that tag
survived".

**Three numbers, reported separately because they license different things.** Stating one would overstate
the other two.

| Level | Count | Meaning |
| --- | --- | --- |
| Wired | **27 of 82** | every loss path for the capability reports |
| — and fire-proven | **27 of 82** | every one of those paths has a test proving it fires |
| — and silence-proven | **27 of 82** | each also has a test proving it stays quiet when nothing is lost |

**Only the fire-proven set may be counted as instrumented.** A wire nobody has seen fire is a gate nobody
has seen fail.

The two numbers were 16 and 10 an hour before this, and the gap was found by measuring the tests against
the wires rather than by trusting an earlier claim of mine that every wire was fire-tested — a claim that
was true of the batch it was made about and false across the whole set. Re-measure rather than trusting
this paragraph too.

**The silence column is the remaining honest weakness.** Fifteen of the sixteen have no test proving they
stay quiet when nothing is lost, so a wire that fired on every import would still pass every proof above.
That is the same defect one level down, and it is why the silence half belongs in the requirement rather
than in an author's judgement. Every other one is **not yet wired**, so
silence about it is uninformative today. This table grows as drop sites are wired; it is the list a
consumer should read rather than assuming coverage, and the count is deliberately stated so a reader
cannot mistake the table's existence for coverage.

## One kind has never been observed, and that is recorded rather than left to be discovered

`swf.uncompressed-signature-invalid` is wired and **unreachable by construction today.** An FWS container
is returned unchanged, every compressed path writes the FWS byte into the decompressed header, and bytes
1 and 2 are validated before either runs. So no input reaches it.

**This is a contingent fact and it carries a stamp, because with no registry to hold it the stamp is the
only thing between a contingent fact and an inherited one.** Derived by reading `swfDocument.ts` at the
commit whose subject is `feat(swf): report each whole-document header rejection with its own cause`, from
the two container paths present there. **Re-derive it; do not inherit it.** If a later reader quotes this
without re-checking, they are quoting a claim about a tree they have not seen.

It is kept rather than deleted because unreachability here is a property of the **two container paths
that existed at that commit**, not of the format. A third container form, or a decompressor that stops rewriting the
header, makes it reachable — and deleting the wire would mean silence arriving with that change.

**For a consumer this means one thing: never treat this kind's absence as information.** Every other kind
in this document is absent because nothing was lost; this one is absent because nothing can produce it.
That is the same absent-versus-measured-negative collision the rest of the cell has been removing, and
naming it here is the only place it can be encoded — a diagnostic kind has no representation of its own.

## Metadata silence is deliberate

Tags carrying no scene content — `FileAttributes`, `Metadata`, `ProductInfo`, `ScriptLimits`, `DebugID`,
`EnableDebugger2`, `EnableTelemetry`, `Protect`, `SetTabIndex`, `DefineButtonCxform`, and the font
hinting/naming tables — are read past and report **nothing**, on purpose. A document is not worse off for
skipping them, and reporting them would bury the entries that mean something under noise a consumer has to
filter. A colocated test asserts the silence, because the silence is the load-bearing half.

## A caller must read **two** populations, and only one is complete when import returns

There are two seams in this SDK by which a caller learns something was lost, and they are complementary
rather than substitutable. Confirmed by reading the source, not from a report.

**Seam 1 — the diagnostics array (this document).** Losses *decided during the parse*. Complete the
moment `createScene2DFromSwf` returns, because nothing about it is deferred.

**Seam 2 — a resource reference's `failure` slot.** Losses *deferred to resolve time*. The exemplar is
the oversized-raster limit in `swfBitmap.ts`: parsing never decodes: it emits an
`EmbeddedImageResourceReference` carrying the SWF-native payload and a container MIME type; the
registered async decoder throws when the raster exceeds the cap; and
`imageResourceReference.ts` catches the cause, writes `failure = createImageResourceFailure(cause)` and
`state = Failed`. `explainImageResourceReferenceResolution` then returns detached plain data. **Geometry
imports, and the failure is externally enumerable — this is what a reported loss looks like, and it
already works.**

### Why the exemplar does not generalise to the parse-time losses

It works because of three preconditions, and the parse-time losses satisfy none of them:

1. **The importer emits a carrier rather than the content** — a durable, addressable reference in the
   output. A declined tag emits *nothing at all*, so there is no object to hang a failure on.
2. **The loss happens after import, in a resolver that owns that carrier** — so a live object is there
   to mutate. A dropped filter field or glyph outline is already gone before import returns.
3. **The carrier type has a failure slot and an `explain*` query.** Giving every surviving
   node and descriptor one would be a seam per carrier type — the opposite of the single seam the shape
   was reached for.

### The asymmetry that matters most for a score

**Seam 2's enumerability is conditional; seam 1's is not.** `failure` is null and `state` is `Unresolved`
until a resolver runs, so a caller that imports and never resolves sees exactly what a caller with a
perfectly good image sees. That silence means *not yet*, and it is indistinguishable at a glance from
*fine* — the precise ambiguity this whole effort exists to remove. The diagnostics array carries no such
window.

So a consumer asking **what did this import lose** must read both populations and must not treat either
as the whole answer. Two consequences for a score: a run that never resolves resources cannot report on
seam 2 at all, and the two populations are keyed differently — diagnostics by `kind` with an optional
`detail.capability`, resources by reference identity — so joining them is work, not a lookup.

**And `MAX_PIXELS` is not an import-time loss at all.** The import fully succeeds and retains the
payload; the failure is at resolve. It is a member of a different population from the unreported
parse-time families, which is why it could be built the way it was.
