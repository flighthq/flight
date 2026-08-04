---
package: '@flighthq/layout'
status: solid
score: 86
updated: 2026-08-04
ingested:
  - charter.md
  - source
---

# layout — Review

## Verdict

**solid — 86/100.** The first increment delivers the complete directed contract: header-first types,
an open resolver registry, anchor/flex/grid policies, allocation-free successful writes, failure
explanations and opt-in guards, and package-level bundle/size evidence. It deliberately stops before
scene binding, constraint solving, text layout, and format wiring.

## Present capabilities

- `resolveLayoutTree` validates buffers and parent-before-child hierarchy, writes every root to the
  available rectangle, then dispatches each child through its parent's registered kind.
- Anchor supports natural or fixed size, four edge pins, opposing-pin stretch, and shared
  `ViewportAlign` positioning in a linear forward pass.
- Flex supports row/column and reverse directions, growth, weighted shrink, basis, cross-axis alignment,
  padding, gap, justification, and wrapping without temporary arrays.
- Grid supports fixed, fractional, and intrinsic tracks; independent padding/gaps; spans; and row-major
  omitted placement without temporary arrays.
- Expected failures are boolean/failure-kind sentinels. `explainLayoutResolution` allocates the detached
  explanation only when asked, while `enableLayoutGuards` is a separate import and accepts a
  caller-owned warning sink so the package does not choose a logging dependency.
- Bundle tests prove anchor-only assembly omits flex and grid. The size fixtures measure **0.63 KB gzip**
  for anchor-only and **2.56 KB gzip** for all three built-ins on 2026-08-04.

## Boundaries and risks

- The flex and grid resolvers trade repeated sibling/track scans for allocation-free execution. Anchor,
  the promised linear path, remains O(n); future profiling should precede any scratch-buffer API.
- Grid's compact first increment is not the full CSS Grid placement algorithm. That is intentional and
  documented rather than hidden behind familiar naming.
- The viewport N=1 finding is architectural evidence only. No viewport implementation changed.
