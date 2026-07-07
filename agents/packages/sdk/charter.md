---
package: '@flighthq/sdk'
crate: null
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# sdk — Charter

## What it is

`@flighthq/sdk` is the **convenience barrel** — a pure re-export of 96 `@flighthq/*` packages from a single `.` entry. Owns no algorithms, types, or runtime. Inclusion policy centralized in `scripts/sdk-policy.ts`. 0 own exports, 22 tests. Depth review: 95/100, "authoritative."

## North star

1. **Pure barrel, zero own code.** SDK owns no algorithms, no types, no runtime. It re-exports the app-facing package set.
2. **Completeness enforced mechanically.** A `packages:check` script should ensure every eligible package is re-exported. No manual drift tracking.

## Boundaries

**In scope:**

- Re-exporting the full app-facing package set from one `.` entry.
- Collision detection tests (ensuring no name collisions across re-exported packages).

**Non-goals:**

- Owning any code, types, or runtime behavior.
- Re-exporting host backends (`host-electron`, etc.) — these are not tree-shakable.

## Decisions

- **[2026-07-02] No blood-from-stone tests.** `collision.test.ts` and `completeness.test.ts` referenced in docs are absent from tree. These were over-engineered tests — do not rebuild. The collision spot-checks in `index.test.ts` are sufficient.

  **Why:** SDK is a barrel. Its correctness is "does it re-export everything without collisions?" A `packages:check` enforcement is the right mechanism, not elaborated test files.

- **[2026-07-02] Completeness check belongs in `packages:check`.** Rather than a test file, add a script-level check to `packages:check` ensuring every eligible package is re-exported from the sdk barrel.

  **Why:** Mechanical enforcement over manual test maintenance.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture (though sdk has no Rust crate — it's a barrel).

## Open directions

1. **`packages:check` completeness rule.** Design the inclusion policy: which packages are eligible for re-export vs excluded (host backends, internal tools)? The current `scripts/sdk-policy.ts` centralizes this — the check should read from it.
