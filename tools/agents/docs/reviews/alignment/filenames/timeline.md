# Filename Alignment: @flighthq/timeline

**Verdict:** Clean. Single-implementation domain package (no backend variants) — both source files name a clear domain object (`movieClip`, `timeline`) and need no backend prefix; tests are colocated and mirror their sources.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `movieClip.ts` — names the `MovieClip` display-object entity (`createMovieClip`, `playMovieClip`, `gotoAndStopMovieClip`, etc.). Passes the folderless test: the bare name identifies the object.
- `movieClip.test.ts` — colocated, mirrors `movieClip.ts`.
- `timeline.ts` — names the `Timeline` / `TimelineSource` domain object (`createTimeline`, `updateTimeline`, `findTimelineLabel`, `playTimeline`, etc.). Self-describing.
- `timeline.test.ts` — colocated, mirrors `timeline.ts`.
- `index.ts` — thin barrel re-exporting both modules; not a dumping ground.
