---
package: '@flighthq/device'
updated: 2026-08-08
by: principal
---

# device — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/device/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **`refreshDeviceInfo` duck-types a method that is not on the seam.** It casts the backend to
  `{ refresh?: () => void }` and calls it when present (`device.ts:269-275`), but `DeviceBackend` in
  `packages/types/src/Device.ts` declares no `refresh`. A native backend author reading the interface
  has no way to learn the hook exists. Either put it on the interface or drop the function.
- **The public `.` lane cannot allocate its own out-params.** `index.ts` exports the four
  `get*(out)` readers but none of `createDeviceCapabilities` / `createDeviceDisplayMetrics` /
  `createDeviceInfo` / `createSafeAreaInsets` (`device/src/index.ts:1-9`, allocators at
  `device.ts:18`, `:28`, `:42`, `:73`), and omits `getDeviceBackend` / `setDeviceBackend` /
  `createWebDeviceBackend`. `power` and `keyboard` share the shape, so this is a lane policy question.
- **`getDeviceId` writes `localStorage` directly.** The web backend reads and writes
  `__flighthq_device_id` itself (`device.ts:114-121`) rather than going through `@flighthq/storage`.
  Whether the install id should ride a storage seam is an unruled dependency-direction decision; the
  source comment at `:113` names the alternative without taking it.
- **`DeviceDisplayMetrics` versus `@flighthq/screen` has no written boundary.** The intended split —
  device owns the built-in display's static data, screen owns live enumeration, work area, and
  orientation — is stated only in a source comment (`device.ts:240`), not in a charter or the package
  map.
- **Two placement questions are open and unbuilt.** No `installSource` / `installerSource` field
  exists anywhere in `packages/` (likely `@flighthq/app` if wanted), and there is no `isDeviceTablet`
  predicate — callers compare `formFactor` themselves.
- **Web capability detection is heuristic by construction.** `hasMouse` is `maxTouchPoints === 0`,
  `hasKeyboard` is a desktop-UA regex, and `hasStylus` is hardcoded `false`
  (`device.ts:81-93`, `:289-291`). Hybrid devices (Surface, iPad with a keyboard) are misreported.
  This is a browser limit, but the values are asserted as flags, not as guesses.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The largest claim checked out **false**:
  the whole "new neighbor package `@flighthq/device-formats`" section, including its four
  `parseUserAgent*` exports and 33 tests, describes a package that does not exist —
  `packages/device-formats/` is absent and `device.ts:9-14` imports the parsers from
  `@flighthq/useragent/contract`, so the split the log celebrated was later collapsed into
  `useragent`. The "README missing" gap was also dropped: `packages/device/README.md` is present.
  Every Rust/`flighthq-device` item went with them — there is no `crates/` directory in this repo.
- **2026-06-25** — `packages/device/README.md` added: the field/unit/sentinel/web-vs-native table for
  `DeviceInfo`, `DeviceCapabilities`, `DeviceDisplayMetrics`, and `SafeAreaInsets`.
- **2026-06-24** — `DeviceCapabilities` (`hasKeyboard`/`hasMouse`/`hasStylus`) added with
  `createDeviceCapabilities` / `getDeviceCapabilities`, scoped to capabilities with no other package
  owner.
- **2026-06-24** — Eight identity fields added to `DeviceInfo` (`boardName`, `colorGamut`,
  `fontScale`, `isHdr`, `marketingName`, `productName`, `supportedAbis`, `webViewVersion`), all web
  sentinels so native backends can fill the full seam.
- **2026-06-24** — `refreshDeviceInfo()` added as an optional backend hook; `enableWebSafeAreaInsets`
  mounts the CSS `env(safe-area-inset-*)` probe.
