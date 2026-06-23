# Filename Alignment: @flighthq/media

**Verdict:** Clean. Single-implementation domain package (not a backend-variant `*-canvas`/`-dom`/`-gl`/`-wgpu` package), so files correctly take plain object names with no backend prefix; both source files name the channel object they operate over, tests mirror them, and the barrel is a thin re-export.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `audioChannel.ts` — names the `AudioChannel` object; every export operates over it (`playAudioResource` produces one, plus `*AudioChannel*` controls). Domain/object name, self-describing without the folder.
- `audioChannel.test.ts` — colocated, mirrors source filename.
- `videoChannel.ts` — names the `VideoChannel` object; same shape (`playVideoResource` + `*VideoChannel*` controls).
- `videoChannel.test.ts` — colocated, mirrors source filename.
- `index.ts` — thin barrel re-exporting the two channel modules; not a dumping ground.
