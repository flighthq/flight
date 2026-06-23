# Filename Alignment: @flighthq/textshaper-canvas

**Verdict:** This is a backend-variant package (`*-canvas`), so every source file must be backend-prefixed PREFIX-FIRST with the `canvas` token — and both source files satisfy this. No issues found.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `canvasTextShaper.ts` — backend prefix-first: `canvas` + `TextShaper`, naming the object it builds (the Canvas 2D text-shaper backend). Self-describing with the folder removed; says "where am I / what backend" at a glance. Not named after its single function (`createCanvasTextShaperBackend`) — it names the object/domain, which is correct.
- `canvasTextShaper.test.ts` — colocated test mirroring the source filename exactly.
- `index.ts` — package barrel (thin re-export of `./canvasTextShaper`); conventionally exempt from the domain-name rule.
