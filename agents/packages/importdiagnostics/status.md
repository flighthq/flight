---
package: '@flighthq/importdiagnostics'
updated: 2026-08-16
by: integration
---

# importdiagnostics — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **The cross-format non-finite-number survey is deferred and unowned.** Two text parsers examined so
  far each admitted a non-finite number into geometry — `path-formats/src/svgPathData.ts` and
  `shape-formats/src/shapeJson.ts`, both since fixed. **Two of two is not a claim about the rest.**
  What is wanted is a yes/no-per-file survey — survey only, no fixes — over the same float-out-of-text
  shape elsewhere. Measured population as of 2026-08-16: **33 non-test files across 9 `*-formats`
  packages** match `parseFloat`/`Number(`, of which **17 mention `isFinite` nowhere**. Read those two
  numbers as *candidates to look at*, not as defects: mentioning `isFinite` is not proof a value is
  gated on the path that reaches geometry, and omitting it is not proof anything is wrong — a parser
  that never feeds a matrix or coordinate has nothing to guard. Reproduce the population with
  `git grep -l 'parseFloat\|Number(' -- 'packages/*-formats/src/*.ts' ':!*.test.ts'`.
- **This cell owns the survey because the seam is shared.** `importdiagnostics` is the structured-
  diagnostics seam every `*-formats` importer reports through, which makes it the one cell that owns a
  cross-format parser-hardening sweep rather than any single format package. The fix for an individual
  finding still belongs to the format package that carries it.
- **The two settled rules any fix must follow.** A malformed document is expected input, so it takes a
  sentinel through the parser's existing null channel rather than a throw; a throw is reserved for API
  misuse. And a writer must not emit what its own reader rejects — `shape-formats` now validates
  through the single predicate both ends share, which is the shape to copy rather than two validations
  that happen to agree.

## Log

- 2026-08-16 — `Open` created; this cell's status.md carried only the append-only-log template and no
  `Open` section, so it is brought to the contract shape. Records the deferred finiteness survey.
