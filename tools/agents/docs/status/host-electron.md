# host-electron status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned the Electron storage backend out of `src/` while its compiled output survived in `dist/`. Recovered by merging `dist/*.js` (impl + verbatim `//` comments) with `dist/*.d.ts` (types), the validated camera pattern.

### Recovered

- **`electronStorage.ts`** — `createElectronStorageBackend(electron, fileName?)`: JSON-file-backed `StorageBackend` over the Electron `userData` directory, synchronous to match the `StorageBackend` contract, all I/O try/catch-guarded returning sentinels (`null`/`false`/`[]`) not throws. Threads file I/O through `ElectronApi.fs` to stay `node:fs`-free.
- **`electronStorage.test.ts`** — 6 tests for `createElectronStorageBackend` (clear, getItem-miss, keys, removeItem, setItem-persist, fresh-when-absent), reconstructed from `dist/electronStorage.test.js`.
- **`electronModule.ts`** (within-file) — restored the `fs: ElectronFs` member on `ElectronApi` and the `ElectronFs` interface (`existsSync`/`readFileSync`/`writeFileSync`), which the storage backend depends on. The rest of the evolved src `ElectronApi` shape was left intact.
- **`electronRegister.ts`** (within-file) — restored the storage wiring lost with the module: the `setStorageBackend` + `createElectronStorageBackend` imports, the `ElectronBackendOptions` interface, the `options: Readonly<ElectronBackendOptions> = {}` parameter, the updated doc comment, and the `setStorageBackend(createElectronStorageBackend(electron, options.storageFileName))` call.
- **`electronRegister.test.ts`** (within-file) — restored the `setStorageBackend` import, the `fs` + `app.getPath` members on the fake Electron, and the `setStorageBackend(null)` afterEach reset.
- **`index.ts`** — added `export * from './electronStorage';` (alphabetized).

### Fossils skipped

None. The only lost module was genuine functionality (the storage capability backend).

### Parked

None. The recovered module's only cross-package type, `StorageBackend`, already exists in `packages/types/src/Storage.ts`, so no `@flighthq/types` edit was needed.

### Test result

`npm run test --workspace=packages/host-electron` — 17 files / 66 tests pass.
