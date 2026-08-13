---
updated: 2026-08-13
by: manager
---

# Test escape modes — how a defect gets past a green suite

Seven ways a real defect survives a test suite that passes. Every one below was **measured**, not
theorised: each cites a defect found on this codebase, with the escape identified afterwards.

**None of them is visible to coverage.** In every case the lines involved already execute. That is the
point of the list — `npm run untested` ranks code nothing *reached*, and these are all defects in code
tests *did* reach, or in code that does not exist to be reached.

## Why a taxonomy rather than "write better tests"

"Be thorough" is advice nobody can act on. Each mode below has a **different detection question**, and the
questions are cheap to ask. Used at authoring time they are faster than used at audit time — most of these
were found by someone asking the question *about their own test, while writing it*.

The four axes make the list derivable instead of memorised. A defect escapes because:

- **the input cannot discriminate** — C, D
- **the assertion cannot discriminate** — B, F, G
- **the expected value is wrong** — A
- **the composition is absent** — E

## The modes

### A — the fixture pins the wrong answer

The test is precise, deliberately constructed, and asserts exactly the property it names. The answer it
asserts is wrong.

> `wrapMeshGeometryUvs`' own test contained `it('maps exactly 1.0 to 0.0', …)` — the destruction written
> down as the expected result, passing every day.

**This is the hardest mode, and the archetype is not a bad test.** Fixture-symmetry cases (mode D) are
tests that *cannot see*; this is a test that **saw perfectly and recorded the wrong answer**. It would have
caught a genuine arithmetic regression. Every quality signal says it is fine: precise, specific, green,
covered, and mutation confirms it catches changes to the code it guards.

**Worst when the fixture comes with prose explaining why the wrong answer is correct.** A comment
justifying the behavior *pre-refutes the reader who finds it*: the one-minute check becomes an argument
with an absent author who has already stated their reasoning, so the cheapest move is to believe them.

> `spine.binary-tail-unparsed` fired on every successful parse, reporting `bytes: 0`. Its test asserted
> that as correct, above a comment explaining that the crumb "still fires to record that the importer
> STOPPED rather than finished." The prose was the defect's own defence. Reading it as a *signal* rather
> than an explanation is what exposed the cause: `buildSpineBinary()` ends exactly where the parser stops,
> so `bytes: 0` was an artifact of the fixture being built to the parser's reach — not evidence of a
> complete parse.

Treat a comment defending surprising behavior as evidence about the behavior, not as a reason to move on.

**Detection:** read what the test *asserts* and ask whether that is the answer you want — never whether the
test is well written, because it is. There is no instrument for this.

**Expect it when fixing:** a mode-A test goes red on a correct fix and *fights the person fixing it*. A red
test here is evidence the fix works. Rewrite it from the contract, never adjust the fix to green it — and
after removing a compensation from a test, **prove the test can still fail**, or "fixing mode A" silently
becomes "deleting the test."

### B — the test asserts only a count

The test is named for a feature and checks a length.

> `awd2Parse.test.ts` had `parses positions-only geometry without indices` asserting only vertex count,
> while that path emitted inverted winding and zero lighting attributes. The torus-knot builder test
> asserted only non-empty counts.

Worse than no test: it occupies the slot the real one would fill and reports green forever.

**Detection:** grep for tests whose only assertions are on `.length` or a bare number.

### C — the case is never constructed

No fixture builds the input, so the code path has no test at all — not a weak one.

> 696 `scene3d-formats` tests passed because nothing constructed a non-indexed AWD2 geometry.

**Detection:** enumerate the input space (indexed/non-indexed, each topology, empty, degenerate,
out-of-range) and ask which cells any fixture reaches.

### D — the fixture is too symmetric to discriminate

The right and wrong implementations produce identical output on the chosen input.

> Three tests covered `scaleMatrix4` at 100% while it scaled rows instead of columns — **a diagonal matrix
> cannot tell the two apart**. A mesh transform test used axis-aligned normals and tangents, where the
> correct transform and the inverse-transpose coincide. A symmetric cube cannot distinguish `min.x` from
> `min.y`.

**Detection:** ask *which wrong answers would also satisfy this fixture*. If the answer is "the one we
have," the fixture is decoration. Build the input that separates them — a rotated basis, an oblique frame,
a non-uniform scale.

### E — both sides tested, the composition untested

Two components each have correct, passing tests. Nothing instantiates both at once, and the defect is in
the contract between them.

> Importer transform tests and renderer cull tests both passed while negative-determinant instances
> rendered inside-out. Parser tests pinned zero tangents; material tests pinned normal-map binding; no test
> composed them into a non-degenerate TBN.

**Detection:** for any contract between two components, does *any* test instantiate both sides together?

### F — the assertion measures a real property, but not the one the name claims

The assertions are genuine and meaningful. They measure something else.

> `mesh-cone` checks centre colour, corner background, and silhouette taper — more assertions than most
> scenes have, none capable of failing on a winding error. It is a projection-and-rasterisation test
> wearing a geometry-builder name, and it would pass with the caps present, absent, inverted, or culled.

**Detection:** name the property the test's *name* promises, then ask which assertion would fail if only
that property broke. If none would, the coverage is nominal.

### G — the assertion measures the right property through too narrow a window

One component of a multi-component result.

> A stencil-restore check verified the **front** face and passed, while the restore call wrote
> `FRONT_AND_BACK` and silently destroyed the back — 7 of 14 parameters. A degenerate-UV fallback writes a
> unit perpendicular free to point along Y or Z; the test asserted only X.

**Detection:** for each assertion, ask which *wrong* answers would still satisfy it.

## Adjacent failures that are not test modes

These share the shape and are worth recognising, but the defect is not in a test:

- **An absent guard is not an untaken arm.** Eight `skeleton2d` files had zero unexamined arms and a
  defect in five of them. There is no branch to be uncovered, because there is no branch. Coverage can
  only rank code that exists, so the missing check is the class it is structurally blind to — and a
  sibling comparison sees it immediately.
- **A mechanism scoped to an internal case, in a location that reads as the general one.** `glRenderPass`
  has a stencil capture/restore pair, so the file reads as handled — but capture is conditioned on
  Flight's own mask depth, so an embedding host's stencil is silently destroyed.
- **A correct rule applied to the wrong domain.** The rule is right and every check confirms it; what is
  unverified is its *scope*, and scope is the thing nobody states.

## Instruments, and what they can and cannot see

- `npm run untested <package>` — arms no test took. Blind to all seven modes above.
- `npm run unchecked <file>` — arms no test would notice breaking. Sees B, D, F, G. **Blind to A**
  (the mutant dies against a wrong expectation, so the test looks healthy), and blind to C and to absent
  guards (no code exists to mutate).
- A **survivor is a question, not a verdict.** Investigate each: an equivalent mutant and a genuine hole
  are both common, and both were found here on the same day. Never report a survivor count as a defect
  count.
- **Not every genuine hole is worth a test.** "Is this a real gap" and "is this gap worth filling" are two
  questions; answering only the first turns a mutation tool into a make-work generator.

## Using the list to write, not only to audit

The cheapest application is at authoring time:

- Before writing a test per residue entry, **ask what the entries have in common**. Seventy-one guard
  entries in `skeleton2d-formats` were one policy stated seventy-one times — *the importer never trusts a
  field's type* — and became two tests, not seventy-one.
- **Build the test's population from the input format, not from the guard list.** A case-per-guard suite
  is a mirror of the implementation: it pins the guards that exist and is structurally blind to the
  missing one. A test that walks the *document* reaches the field nobody thought to guard, by
  construction.
- Write the test from **the property the code exists to guarantee**, not from the mutant you are trying to
  kill. A test written from the contract kills the mutant as a consequence; one written from the mutant
  passes and teaches nobody what the branch is for.
