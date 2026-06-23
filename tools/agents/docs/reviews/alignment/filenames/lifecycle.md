# Filename Alignment: @flighthq/lifecycle

**Verdict:** Clean. This is a single-implementation event capability package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so the backend-prefix rule does not apply; the lone domain file `lifecycle.ts` carries the full lifecycle domain (entity quartet + state query + web backend seam) and is self-describing.

## Findings

| File   | Issue | Suggested rename |
| ------ | ----- | ---------------- |
| _none_ | —     | —                |

## Clean

- `src/index.ts` — thin barrel (`export * from './lifecycle'`), not a dumping ground.
- `src/lifecycle.ts` — names the package domain `lifecycle`; holds the whole domain (`createAppLifecycle`/`attachAppLifecycle`/`detachAppLifecycle`/`disposeAppLifecycle`, `getAppLifecycleState`, and the `get/set/createWeb` backend seam). Not named after one function; passes the remove-the-folder test. The web default living inside the single domain file is correct here — this is a single-implementation capability, not a backend-variant package, so no `webLifecycle.ts` split is warranted.
- `src/lifecycle.test.ts` — colocated, mirrors the source filename exactly.
