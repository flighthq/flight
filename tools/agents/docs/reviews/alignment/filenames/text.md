# Filename Alignment: @flighthq/text

**Verdict:** Mostly clean. This is a single-implementation domain package (no backend variants), so plain domain/object filenames are correct and no backend prefix applies. One file (`textLabelLayout.ts`) is misnamed for its scope, and `internal.ts` is a generic catch-all name carried over from the legacy `internal.ts` cast pattern.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `textLabelLayout.ts` | Names the `TextLabel` object but the file is the shared text-layout cache domain that serves both `TextLabel` and `RichText` (its own doc comment says "TextLabel or RichText alike", and `ensureTextLayout`/`getTextLayout`/`getTextLayoutMetrics` are typed over `Readonly<TextLabel>`, the shared base, not the label specifically). The `textLabel` prefix understates the scope. | `textLayoutCache.ts` (or `textLayoutEnsure.ts`) — names the lazy-layout-ensure domain that both text kinds share. |
| `internal.ts` | Generic dumping-ground name with no domain/object signal; fails the "remove the folder, still self-describing" test. Holds only `RichTextDataInternal` (the legacy `internal.ts` writable-cast pattern that CLAUDE.md says not to extend). Acceptable as the established cast-shim convention, but the name carries no domain. | `richTextDataInternal.ts` — names the type it defines. (Or migrate the writable `scrollH`/`scrollV` to a runtime slot and delete the file, per the CLAUDE.md guidance to prefer runtime slots over `internal.ts` casts.) |

## Clean

These pass the domain/object test — each names the object it constructs and operates over (the `create*`/`get*Runtime`/`set*` quartet pattern), and each has a colocated `*.test.ts`:

- `nativeText.ts` — `NativeText` display object (create/data/runtime + `setNativeText*` setters and bounds).
- `richText.ts` — `RichText` display object (create/data/runtime, format ranges, scroll, password, wheel, bounds).
- `textLabel.ts` — `TextLabel` display object (create/data/runtime + `setTextLabel*` setters and bounds).
- `index.ts` — package barrel; conventional, thin re-export only.

Test files mirror their sources exactly (`nativeText.test.ts`, `richText.test.ts`, `textLabel.test.ts`, `textLabelLayout.test.ts`). `internal.ts` has no test, which is correct — it is a type-only cast shim with no runtime exports.
