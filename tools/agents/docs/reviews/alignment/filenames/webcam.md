# Filename Alignment: @flighthq/webcam

**Verdict:** Clean. This is a single-implementation platform-capability package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so the backend-prefix rule does not apply; the one source file takes a plain domain name and is self-describing. The web backend correctly lives inside `webcam.ts` (`createWebWebcamBackend`) rather than in a separate backend-named file.

## Findings

| File     | Issue                     | Suggested rename |
| -------- | ------------------------- | ---------------- |
| _(none)_ | No filename issues found. | —                |

## Clean

- `src/webcam.ts` — Names the domain (the webcam capability) and houses the full capability surface: all seven exported functions (`createWebWebcamBackend`, `getWebcamBackend`, `setWebcamBackend`, `requestWebcamPermission`, `takeWebcamPhoto`, `recordWebcamVideo`, `pickWebcamImage`). Self-describing with the folder removed; not named after a single function.
- `src/webcam.test.ts` — Colocated test mirroring the source filename exactly.
- `src/index.ts` — Standard thin barrel (`export * from './webcam'`); the conventional package entry, not a generic dumping ground.
