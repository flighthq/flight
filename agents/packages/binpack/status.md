---
package: '@flighthq/binpack'
updated: 2026-08-13
by: builder2
---

# binpack — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## Open

- **The mutation survivors are CHARACTERISED, not a coverage gap — do not reopen them as one.**
  `npm run unchecked binpack` reports **93 survivors of 168 reachable mutants** (81 in
  `packRectangles.ts`, 12 in `explainUnpackedRectangles.ts`), clustered on heuristic scoring
  (`packRectangles.ts:230`, `:233`), the growth schedule (`:106`–`:112`), and free-rectangle splitting.
  They survive for a structural reason rather than a thin-test reason: **the suite's invariants are
  necessary properties of ANY VALID PACKING, not of a PARTICULAR one.** A mutation to a heuristic, a
  growth step, or a split yields a *different but still valid* packing — no overlap, everything inside
  the bin, nothing placed twice, still deterministic — so no structural invariant can distinguish it.
  Adding more structural invariants cannot close this; only a different kind of assertion could.
- **The determinism check is structurally blind to the same class, and that is worth knowing where a
  reader meets it.** `packRectangles.test.ts` re-packs the same input and compares, which is a real
  check for a real documented property. But it compares a run against itself **under the same code**,
  so both sides move together under any mutation. It can catch nondeterminism; it can never catch a
  changed-but-deterministic arrangement.
- **A pinned "golden" packing is REJECTED, and not on cost grounds.** The function documents
  *determinism* — same input, same output, always. That is not the same claim as *this particular
  arrangement, forever*. A pinned packing asserts more than the contract states, so it would rot under
  legitimate improvement: over-specification, not bad luck or weak discipline in whoever updates it.
- **If a quality guard is ever wanted for the heuristic class, its shape is already decided: RELATIVE,
  never a threshold and never an identity pin.** Compare against a reference — a trivial shelf or
  first-fit packer, or the area lower bound — and assert this packer is at least as good on every seed.
  That is stable under legitimate improvement (which only widens the gap) and still fails on genuine
  degradation. An absolute occupancy floor was measured and declined: baseline worst 0.5454 / mean
  0.7811 over the 40 seeds; under a survivor-class mutation (swapping the secondary tie-break) worst
  falls to 0.5183 while **mean rises** to 0.7820 — so a worst-case floor catches it by 0.027 and a
  mean-based floor misses it entirely, on an arbitrary threshold.

## Log

- 2026-08-13 — `explainUnpackedRectangles` matched unpacked pieces by **set membership** of their id
  while `packRectangles` reports `unpacked` as a **multiset** and treats same-id rectangles as distinct
  pieces: two rectangles sharing an id where only one fits produced two explanations for one failure,
  against the function's own stated contract. Fixed by consuming a count; which duplicate an entry
  describes is positional, because the packer sorts by area and reports bare ids. Coverage added for
  identity-by-multiset, rotation metadata fidelity, and occupancy consistency, and the seeded run now
  draws colliding ids (7 of 40 seeds, deepest repeat 8).
