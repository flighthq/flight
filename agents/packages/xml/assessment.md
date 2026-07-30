---
package: '@flighthq/xml'
updated: 2026-07-30
basedOn: ./review.md
---

# xml — Assessment

The charter remains undirected. This assessment completes only the scope-independent parser work and
does not infer whether `@flighthq/xml` should remain a lightweight format utility or grow toward the
full domain.

## Recommended

No open sweep-safe items. The four stale partial-45 tasks were already live; this audit hardened the
DOCTYPE implementation, repaired literal CDATA handling, preserved unsupported numeric references, and
added regressions for each discovered edge.

## Approved

1. **[2026-07-30 · completed] Preserve `>` inside quoted attribute values.** Landed in `69fd6414f`;
   double- and single-quoted regressions remain live.
2. **[2026-07-30 · completed] Strip DOCTYPE internal subsets.** The initial implementation landed in
   `69fd6414f`; `f8c479d03` completes it for quoted `]`/`>` literals with a scanner.
3. **[2026-07-30 · completed] Correct the "pull-style" description.** `69fd6414f` describes the
   one-shot tree-building/DOM-style model in both source and package metadata.
4. **[2026-07-30 · completed] Add the query-helper layer.** `69fd6414f` exports string/number attribute
   queries and first/all direct-child queries through both blessed lanes.

## Backlog

- Direction session: bless lightweight parse-only XML as the durable ceiling, or stage serializer,
  positioned diagnostics/validation, namespace resolution, then an optional streaming tier.
- Decide whether strict well-formedness is an opt-in parser mode or intentionally absent.
- Consider exact-text projection semantics beyond the ordered `content` representation.
- Migrate format consumers to the query helpers when those packages are next in scope.
