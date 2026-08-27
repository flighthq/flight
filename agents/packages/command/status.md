---
package: '@flighthq/command'
updated: 2026-08-27
by: builder2
---

# command — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **The charter is a draft.** Two rulings in it are user-directed and dated (package-only deliverable;
  data commands over closures). The rest followed from those and is unblessed, and the source record
  `command-history-model.md` is itself unratified. Treat `North star` and `Boundaries` as proposed.
- **`review.md` and `assessment.md` do not exist**, because those stages have not run. That is the
  contract's meaning for their absence, not an omission to paper over — a survey nobody performed should
  not be written by the author of the code it would survey.
- **`target` is a live node reference, so every built-in command carries exactly one non-serializable
  field and a history cannot yet be written to disk.** It stays that way until `scene-document` supplies
  stable node identity by key and path, at which point `target` becomes a key and the limit lifts with no
  change to the command shape. This is the accepted limit
  recorded in the charter, not a defect: nodes have no stable identity to name instead until
  `scene-document` supplies one. Everything else on a command already serializes. The type carries this
  warning at its head, where someone reaching for persistence will read it.
- **Merge policy is one rule.** Same target, same property, both commands carrying a positive
  `mergeWindow`, elapsed `time` inside it. Gesture-identity grouping and an explicit coalesce flag are
  expressible as registered mergers but nothing has asked for them.
- **No consumer yet.** `gizmo` is the intended first caller and does not exist. Until something drives a
  real drag through `beginCommandTransaction`, the bracket API is verified only by its own tests.
- **`getCommandHistoryEntries` returns the live array**, not a copy. Cheap and portable, but a caller that
  mutates it corrupts the stack. If this bites, the fix is an `out`-parameter form rather than a defensive
  copy on every call.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-27** — Cell authored (charter + status) as an isolated docs repair; `docs:check` had flagged
  the package as having no cell. No `review.md`/`assessment.md`: those stages have not run.
- **2026-08-27** — Package built: `command.ts` (data constructors), `commandBinding.ts` (the keyed-table
  registry and the five built-in bindings), `commandHistory.ts` (stack, undo/redo, trim),
  `commandTransaction.ts` (nestable brackets), `commandHistorySignals.ts` (opt-in `onChange`),
  `explainCommandDispatch.ts` (the shakeable `explain*` behind the `false` sentinel). Types in
  `@flighthq/types/src/Command.ts`. 58 tests across 6 colocated files; `npm run size` byte-identical to
  the pre-command baseline across all 139 cases.
