# Filename Alignment: @flighthq/textlayout

**Verdict:** Clean. This is a single-implementation domain package (no backend variants), so plain domain/object filenames are correct and no backend prefix applies. Every one of the 12 source files names a domain or object, not a single function, and each has a colocated `*.test.ts`.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

All source filenames pass the "remove the folder, still self-describing" test. None are generic dumping grounds (no `data.ts` / `format.ts` / `query.ts` / `utils.ts` / `helpers.ts`), and the few that look query-ish are scoped to a named object domain rather than a single function:

- `richTextContent.ts` — RichTextContent object (create/compute/get/clear quartet over the content cache).
- `richTextMetrics.ts` — RichText scroll/extent metrics domain.
- `richTextQuery.ts` — RichText spatial/index query domain (char↔point, line lookups, selection rects). `query` here is qualified by the `richText` object domain, not a bare `query.ts`.
- `textBounds.ts` — text bounds computation domain (width/height/offset/rectangle).
- `textFormat.ts` — TextFormat object (metrics accessors + merge).
- `textFormatRange.ts` — TextFormatRange object constructor. Small (one export) but named for the object it produces, not the function — passes the domain/object test.
- `textLayout.ts` — the core TextLayoutResult layout engine.
- `textLayoutGroup.ts` — TextLayoutGroup object constructor; named for the object.
- `textLayoutMeasure.ts` — the text-measure provider seam (get/set provider over the textshaper backend). Names the measure-provider domain.
- `textLayoutRuntime.ts` — TextLabelRuntime layout-cache accessors; names the runtime tier it operates on.
- `textLineBreaks.ts` — line-break index domain.
- `textMetrics.ts` — TextMetrics object (create + populate).

Filename basenames mirror their exported objects/domains and are globally legible. The `text`-package consumers (`buildRichTextLayoutParams`, `ensureTextLayout`, etc.) live in `@flighthq/text`, not here, so there is no cross-domain leakage into these filenames.
