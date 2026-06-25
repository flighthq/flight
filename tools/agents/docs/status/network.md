# @flighthq/network — status

## 2026-06-25 — builder R2-4 lost-source recovery

Surveyed `packages/network/dist/` against `packages/network/src/` for lost source. **No recovery needed — the package is fully intact.**

- The only dist module is `dist/network.js` (+ `dist/network.d.ts`), matched 1:1 by `src/network.ts`. `dist/index.js` is the barrel only.
- All 14 exported functions present in `dist/network.d.ts` already exist in `src/network.ts`: `attachNetwork`, `createNetwork`, `createNetworkStatus`, `createWebNetworkBackend`, `detachNetwork`, `disposeNetwork`, `getNetworkBackend`, `getNetworkStatus`, `hasNetworkStatusChanged`, `isNetworkMetered`, `isNetworkOnline`, `isNetworkSaveDataEnabled`, `probeNetworkReachability`, `setNetworkBackend`.
- All 14 `describe` blocks in `dist/network.test.js` are present in `src/network.test.ts`.
- `src/index.ts` already re-exports `./network`.

The curation did not prune this package's source.

### Test result

`npm run test --workspace=packages/network`: **PASS** — 1 file, 32 tests passed.

### Fossils skipped

None.

### Parked

None.

## 2026-06-25 — builder R2-4 second-pass recovery

Re-surveyed `packages/network/dist/` against `packages/network/src/` after the types-recovery pass (the ~94 lost types restored to `@flighthq/types`). **Still nothing to recover — the package remains fully intact.**

- The only dist source module is `dist/network.js` (+ `dist/network.test.js`); `dist/index.js` is the barrel only. All three are matched 1:1 by `src/network.ts`, `src/network.test.ts`, and `src/index.ts`.
- All 14 exported functions in `dist/network.d.ts` are present in `src/network.ts` with identical implementation, verbatim comments, and `Readonly<>`/type annotations. No function-level gaps.
- All 14 `describe` blocks in `dist/network.test.js` are present in `src/network.test.ts`.
- No module was parked last pass (none had a "needs type X" block), so the types-recovery pass unblocked nothing here.

### Recovered

None — already complete.

### Skipped (fossil)

None.

### Parked

None.

### Test result

`npm run test --workspace=packages/network`: **PASS** — 1 file, 32 tests passed.
