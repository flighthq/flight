# Filename Alignment: @flighthq/device

**Verdict:** Clean. This is a single-implementation domain package (not a backend-variant `-canvas`/`-dom`/`-gl`/`-wgpu` package), so files take plain domain names with no backend prefix; the lone `device.ts` names the domain it covers and passes the folder-removal test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `device.ts` — names the package's domain/object (device identity, the swappable `DeviceBackend`, and safe-area insets). Removing the folder, `device.ts` is fully self-describing. All seven exports (`createDeviceInfo`, `createSafeAreaInsets`, `createWebDeviceBackend`, `getDeviceBackend`, `getDeviceInfo`, `getSafeAreaInsets`, `setDeviceBackend`) belong to this one domain, so a single domain-named file is correct — not a per-function split. Safe-area insets are a documented sub-concern of `@flighthq/device` (per the codebase map), so they stay in `device.ts` rather than a separate `safeAreaInsets.ts`.
- `index.ts` — conventional thin barrel (`export * from './device'`), the package's single root entry. Standard across the monorepo; not a dumping ground.
- `device.test.ts` — colocated test mirroring `device.ts` exactly.
