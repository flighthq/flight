# Depth Review: @flighthq/protocol

**Domain**: Custom URI-scheme registration and deep-link (open-URL) handling — the seam an app uses to claim `myapp://…` with the OS and to receive incoming deep links. The industry references are Electron (`app.setAsDefaultProtocolClient` / `removeAsDefaultProtocolClient` / `isDefaultProtocolClient`, the `open-url` / second-instance `argv` path), Tauri's `deep-link` plugin (`register`, `unregister`, `isRegistered`, `getCurrent`, `onOpenUrl`), Capacitor `App.addListener('appUrlOpen')` + `getLaunchUrl`, Cordova `custom-url-scheme`, and React-Native / Expo `Linking` (`getInitialURL`, `addEventListener('url')`, `parse`/`createURL`).

**Verdict**: solid — 70/100

This is a platform-integration capability, not a self-contained algorithm library, so the honest bar is "does it cover what a mature deep-link integration is expected to expose," not "does it stand alone like easing/path." Against that bar it covers the core registration

- delivery surface cleanly and idiomatically, but it is missing two features that every reference implementation treats as table stakes — the cold-start/launch URL and the default-handler removal/query asymmetry — plus deep-link URL parsing helpers.

## Present capabilities

Control (over the swappable backend, web default lazily created):

- `registerProtocolScheme(scheme)` / `unregisterProtocolScheme(scheme)` — register and tear down a custom URI scheme; sentinel `false` when the host denies/lacks support.
- `isProtocolSchemeRegistered(scheme)` — registration query.
- `setProtocolSchemeAsDefault(scheme)` — claim the scheme as the OS default handler.
- `getProtocolBackend()` / `setProtocolBackend(backend|null)` / `createWebProtocolBackend()` — the standard command-capability backend seam: always-available web default, native host swaps it in, `null` resets to web.

Event delivery (the event-capability entity shape mirroring `@flighthq/application` window wiring):

- `createProtocolHandler()` — allocates a `ProtocolHandler` with an inert `onOpenUrl` signal.
- `attachProtocolHandler` / `detachProtocolHandler` / `disposeProtocolHandler` — start/stop delivery; `attach` is idempotent (re-subscribes cleanly); `dispose` releases to GC.

Web backend correctly degrades: `register` wraps `navigator.registerProtocolHandler`, returns `false` when absent/throwing; `unregister`/`isRegistered`/`setAsDefault` honestly report `false` (no programmatic web equivalent); `subscribe` is inert (deep-link routing needs a native host). Backend trait (`ProtocolBackend`, `ProtocolHandler`) lives in `@flighthq/types` as required. Full colocated test coverage, one `describe` per export.

## Gaps vs an authoritative deep-link library

Missing-by-omission (these are canonical, present in essentially every reference impl):

- **Launch / initial URL (cold start).** There is no `getProtocolLaunchUrl()` / `getInitialProtocolUrl()`. When an OS launches the app _because_ a deep link was clicked, the URL arrives before any listener is attached — `subscribe`/`onOpenUrl` only catch _warm_ opens. Every reference has this: RN `Linking.getInitialURL`, Capacitor `App.getLaunchUrl`, Tauri `getCurrent`, Electron's `argv`/`open-url`-at-launch handling. This is the single most important gap; without it deep-link launches are silently dropped.
- **Default-handler asymmetry.** `setProtocolSchemeAsDefault` exists but there is no `removeProtocolSchemeAsDefault` (Electron `removeAsDefaultProtocolClient`) and no `isProtocolSchemeDefault` query (Electron `isDefaultProtocolClient`). "Set default" with no "is default?" / "clear default" is an incomplete control triplet — you can claim the scheme but can never check or relinquish it.
- **Deep-link URL parsing.** No `parseProtocolUrl(url)` → `{ scheme, host, path, query }` or `createProtocolUrl(...)` builder. RN/Expo `Linking.parse`/`createURL` and most routers ship this because consumers always re-implement scheme/host/path/query splitting at the callsite otherwise. Arguably could live in a URL package, but it is the natural payload helper for this domain.

Lower-priority / nice-to-have:

- No way to enumerate registered schemes (`getRegisteredProtocolSchemes`) — minor; not all hosts can answer.
- No multi-scheme convenience (`registerProtocolSchemes([...])`) — purely ergonomic.

Missing-by-design (correctly excluded, not gaps):

- Programmatic web unregister / default-claim — no platform API exists; honestly reported as `false` rather than faked.
- Actual native routing — that is a `host-*` backend concern; the seam is the package's job and it is present.

## Naming / API-shape notes

- Naming is consistent and self-identifying: every function carries the full `Protocol` type word and the control/event verbs match the documented capability conventions. Good.
- **Casing inconsistency vs the docs:** the Package Map says "an `onOpenURL` handler entity," but the code/type use `onOpenUrl` (and `LaunchUrl` would follow). Pick one. The rest of the codebase trends toward `Url` (e.g. `subscribe` listener takes `url`); align the doc to `onOpenUrl`, or rename the signal to `onOpenURL` to match the prose — but make them agree.
- Entity/runtime + free-function + backend-seam style is followed exactly; tree-shakable, `sideEffects: false`, single root export. No structural complaints.
- If launch URL is added, prefer a flat command `getProtocolLaunchUrl(): string | null` (cold-start is a one-shot query, not an event), keeping `onOpenUrl` for warm opens — this matches the RN/Capacitor split and the codebase's "sentinel for expected absence" rule.

## Recommendation

Promote toward authoritative by closing the three omission gaps, in priority order:

1. Add `getProtocolLaunchUrl()` (+ `ProtocolBackend.getLaunchUrl()`), returning `null` when the app was not launched via a deep link. This is the highest-value addition.
2. Complete the default-handler triplet: `isProtocolSchemeDefault(scheme)` and `removeProtocolSchemeAsDefault(scheme)` (+ matching `ProtocolBackend` methods `isDefault` / `removeAsDefault`).
3. Add `parseProtocolUrl(url)` (and optionally `createProtocolUrl(parts)`) as the standard payload helper, or explicitly delegate it to a URL utility package and note the decision.

Also reconcile the `onOpenUrl` vs `onOpenURL` casing between code and the Package Map. With items 1–2 in place this package would sit at authoritative for its (deliberately narrow) domain; the current surface is genuinely solid but drops cold-start deep links, which a mature library must not.
