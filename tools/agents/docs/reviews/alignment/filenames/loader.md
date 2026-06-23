# Filename Alignment: @flighthq/loader

**Verdict:** Clean. Single-implementation domain package (NOT a backend-variant), so no backend prefix applies; `resourceLoader.ts` correctly names the `ResourceLoader` object that all three exports operate over, the test is colocated and mirrors the source, and `index.ts` is a thin barrel.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `index.ts` — standard barrel (`export * from './resourceLoader'`); conventional and not a dumping ground.
- `resourceLoader.ts` — names the `ResourceLoader` object/domain, not one function. The bare filename is self-describing: removing the folder still reads as "the resource loader." All exports (`createResourceLoader`, `queueResourceLoad`, `startResourceLoad`) operate over this object, so it is correctly an object-named domain file, not a function-named file.
- `resourceLoader.test.ts` — colocated as `<source>.test.ts`, mirroring the source filename exactly.
