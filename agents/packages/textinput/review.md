---
package: '@flighthq/textinput'
status: solid
score: 82
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - prior review (2026-06-25 merge gate)
---

# textinput — Review

## Verdict

**Solid — 82/100.** The 2026-06-25 partial-38 merge-gate review no longer describes the live package.
Its missing-type and unreachable-export blockers are resolved, the package exposes a coherent editable
text field and read-only selection layer, and its compile, API, export, type-home, portability, and test
gates pass. The remaining distance is mainly international-text correctness and a few host-policy
questions, not unfinished basic editing.

## Present capabilities

- Fifty-five exported free functions cover the `enableTextInput` runtime slot, caret and range selection,
  word/line/all selection, insertion/replacement/deletion, input restrictions, password display, focus,
  pointer and wheel dispatch, clipboard callbacks, and caret-visibility scrolling.
- Keyboard editing includes horizontal and vertical motion, desired-x preservation, word motion and
  deletion, selection extension, undo/redo, and line-relative Home/End. Ctrl/Cmd+Home/End retain
  document-level navigation.
- Undo/redo uses bounded, mergeable history records with public availability queries and explicit history
  clearing. Mutation remains free-function based and invalidates appearance through the owning node.
- `TextInputManager` and `SelectableRichTextManager` keep editable and read-only concerns separate while
  sharing the underlying `RichText` layout and selection primitives.
- The package is side-effect-free at import, owns no renderer or system clipboard, keeps public types in
  `@flighthq/types`, and depends only on its declared `node`, `signals`, `text`, `textlayout`, and `types`
  neighbors.

## Stale-cell audit and live fix

All three July 2 assessment headlines had already advanced before this review:

- The editing command became line-relative in `e2b458de0`, including Ctrl/Cmd document-level variants and
  direct command tests.
- All eight named functions are reachable from both the root barrel and `/contract`; their current public
  promotion is visible in `68d3af93e` and `3def2fddd`.
- The Package Map already carries the requested full capability description, including line-relative
  navigation, undo/redo, restrictions, scrolling, managers, and input-signal wiring.

The audit did uncover a real integration gap behind the first stale headline. The low-level command
accepted a layout, but `dispatchTextInputKeyDown` did not pass the focused target's runtime layout. Thus
the normal `connectInputToTextInput` path still fell back to document start/end for Home/End (and could not
perform true vertical navigation). `3a718da05` now threads that live layout into keyboard handling, with a
manager-level multiline Home/End regression test.

## Remaining depth

- Editing indices are UTF-16 code-unit offsets. Backspace, Delete, horizontal movement, selection, and
  restriction truncation can split surrogate pairs or combining sequences. The charter correctly keeps
  grapheme-cluster awareness as a long-term requirement.
- There is no explicit composition lifecycle for IME input. Normalized committed text can be inserted, but
  pre-edit ranges, candidate updates, composition cancellation, and composition-aware history merging are
  absent.
- Platform key policy is intentionally compact but not fully native. In particular, macOS Command+Arrow
  and Option+Arrow conventions cannot be selected from the current platform-agnostic event mapping with
  complete fidelity.
- Before the first text layout exists, layout-dependent commands deliberately fall back to document
  boundaries. That is safe, but callers do not receive a capability signal distinguishing the fallback
  from a visually resolved move.
- `historyLimit` and the `mergeKind` string convention are public behavior without a dated direction
  decision. The dual editable/read-only selection representations also remain an integration cost even
  though the separate-manager decision is sound.

## Charter and boundary conclusion

The package matches its charter: editing behavior stays in free functions over runtime slots, selection-only
and editable managers remain distinct, layout stays in `@flighthq/textlayout`, rendering stays in
`@flighthq/text`, and system clipboard ownership remains outside the cell. The Package Map is already
current. Future work should concentrate on grapheme and IME architecture or explicit host-policy decisions,
not repeat the completed July 2 sweep.
