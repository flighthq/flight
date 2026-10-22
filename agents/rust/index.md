# The Rust Library

The Rust crates under `crates/` follow [`crates/AGENTS.md`](../../crates/AGENTS.md); read that first. This file indexes the Rust design records, references, and research. Each document states its own status in its own header.

## Rulings and plan

- [design decisions](design-decisions.md) — the D-numbered rulings (APPROVED, DIRECTION, PROPOSED) outside flight-geometry.
- [plan](plan.md) — the execution plan and its phases.
- [API drift](api-drift.md) — historical snapshot of where the earlier Rust port differed from TS signatures.

## References

- [IR vocabulary](ir-vocabulary.md) — the closed contract vocabulary of language constructs that transpile to TS, C++, and Haxe.
- [host vocabulary](host-vocabulary.md) — the platform half of that vocabulary: objects a host provides and the SDK does not define.
- [free functions](free-functions.md) — canonical free-function patterns by category.
- [type stubs](type-stubs.md) — how to stub types referenced across modules.

## Research

- [construction table](research/construction-table.md) — D23/D24 construction and hidden-allocation review.
- [crate layout hybrid](research/crate-layout-hybrid.md) — flight-types at the bottom vs sugar-bearing types.
- [dissolve types](research/dissolve-types.md) — whether every type can live in its owning package.
- [text and host ownership](research/text-host-ownership.md) — the text and host subsystems and the ambiguous types.
- [type owners](research/type-owners.md) — the consolidated type and export ownership table.
- [host type inventory review](research/host-type-inventory-review.md) — principal review of the D26 host inventory.
- [phase 3 closure audit](research/phase3-closure-audit.md) — collision and D23/D24 closure audit.
- [phase 3 test audit](research/phase3-test-audit.md) — source-test audit of the Phase 3 crates against TS.

## Sketches

- [render sprite](sketches/render-sprite.md) — GL and wgpu sprite rendering end to end.
- [scene2d sprite](sketches/scene2d-sprite.md) — superseded by D16; kept for history.
