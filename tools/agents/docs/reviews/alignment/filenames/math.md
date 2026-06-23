# Filename Alignment: @flighthq/math

**Verdict:** Single-implementation domain package (general math utilities) — no backend prefix expected; one file is named after a single function (`nextPowerOfTwo.ts`) rather than its domain and should be renamed.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `src/nextPowerOfTwo.ts` | Named after a single function, not a domain/object. The bare filename describes one operation, not the area it belongs to. This domain (power-of-two integer arithmetic) is the natural home for siblings like `isPowerOfTwo` and `previousPowerOfTwo`, which AAA-completeness guidance would expect it to grow toward. | `powerOfTwo.ts` (+ `powerOfTwo.test.ts`) |

## Clean

- `src/random.ts` / `src/random.test.ts` — names the domain/object (seeded random generation); self-describing with the folder removed. Hosts `createRandomSource` and could grow `randomRange`, `randomInt`, etc. without a rename.
- `src/index.ts` — thin barrel re-export only (`export * from './nextPowerOfTwo'` / `'./random'`), not a dumping ground; acceptable.
- Test colocation — both source files have a matching `<source>.test.ts` mirroring the source filename.
