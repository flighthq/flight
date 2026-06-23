# Filename Alignment: @flighthq/displayobject

**Verdict:** Single-implementation domain package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so plain domain/object filenames are correct and no backend prefix applies. All source files name a concrete display-object type and pass the drop-the-folder test; the lone soft flag is the generic `internal.ts` (legacy cast holder), which names a mechanism rather than the object it covers.

## src/ files

- `bitmap.ts` (+ `bitmap.test.ts`)
- `displayContainer.ts` (+ `displayContainer.test.ts`)
- `displayObject.ts` (+ `displayObject.test.ts`)
- `htmlView.ts` (+ `htmlView.test.ts`)
- `index.ts`
- `internal.ts`
- `renderView.ts` (+ `renderView.test.ts`)
- `stage.ts` (+ `stage.test.ts`)
- `video.ts` (+ `video.test.ts`)

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `internal.ts` | Generic, non-domain name. Holds the `DisplayObjectInternal` type (the legacy `internal.ts` cast pattern the conventions doc says not to extend). The bare name carries no domain — drop the folder and `internal.ts` could belong to any package. | `displayObjectInternal.ts` (names the object). Better: retire the cast per the runtime-slot guidance and remove the file entirely. |

## Clean

- `bitmap.ts` — object `Bitmap`; self-describing.
- `displayContainer.ts` — object `DisplayContainer`; self-describing.
- `displayObject.ts` — base object/domain `DisplayObject`; self-describing.
- `htmlView.ts` — object `HtmlView`; self-describing.
- `renderView.ts` — object `RenderView`; self-describing.
- `stage.ts` — object `Stage`; self-describing.
- `video.ts` — object `Video`; self-describing.
- `index.ts` — barrel re-export; thin and exempt (not a dumping ground).
- All tests colocated as `<source>.test.ts`, mirroring source filenames.
