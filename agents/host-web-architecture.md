# Host Architecture Record v10

**Status:** design record — direction settled (user ruling), shape defined.

Web backends are extracted from capability packages into `@flighthq/host-web`. Three capabilities (net, socket, textsegment) are ambient-language facilities — standard-JS implementations that stay inline in their capability packages, structurally unchanged. Phase 3 creates `host-web` only.

App vocabulary: `enableHostWeb()`, `enableHostWebClipboard()`. Host-author seam: `set*Backend`, `*Backend` interfaces in `@flighthq/types`. 108 existing `enable*` exports; zero existing `enableHost*` — no collision.

---

## 1. Design Tension

### Current shape (lazy self-install)

37 packages carry 38 `createWeb*Backend` functions. Each capability package co-locates three functions:

```
getClipboardBackend()       → returns _backend ?? createWebClipboardBackend()
setClipboardBackend(b)      → replaces _backend
createWebClipboardBackend() → builds the navigator.clipboard implementation
```

The web implementation is coupled to the contract: importing `readClipboardText` forces `createWebClipboardBackend` into the bundle because `getClipboardBackend()` has a direct runtime reference to it. A bundler cannot tree-shake it.

### AGENTS.md tension

- **sideEffects: false** — the lazy self-install is implicit, not top-level, but the caller of `readClipboardText` did not ask for `createWebClipboardBackend` to execute.
- **explicit opt-in** — the backend self-install mutates module-scoped `_backend` on first use, a hidden registration.
- **C/C++ portability** — a C port expects `set*Backend` at init, not lazy binding.
- **bundle invariant** — an Electron app importing `readClipboardText` pays for web code it never uses.

### What extraction preserves

Zero-config moves to one explicit line (`enableHostWeb()`). The word "Backend" does not appear in the app-facing setup surface.

---

## 2. Layer Model

### Two layers

| Layer | Package | Role | Example |
|-------|---------|------|---------|
| **Host** | `host-web`, future `host-node`, `host-electron`, `host-tauri`, `host-capacitor` | Platform-specific implementation requiring browser/OS/native APIs | `navigator.clipboard`, `window.localStorage`, Electron IPC |
| **Capability** | `clipboard`, `storage`, `tray`, ... | Contract + sentinel + ambient-language facilities. Owns `get*Backend` / `set*Backend`. | `readClipboardText()` calls `getClipboardBackend().readText()` |

### Ambient-language facilities

Three capabilities use standard ECMA/WinterCG APIs available in all modern JS runtimes. Their implementations stay inline in the capability package — they are language facilities, not host-specific code. All three remain structurally unchanged: same function names, same lazy-install pattern, same file locations.

| Capability | Factory | API used | Seam rationale |
|------------|---------|----------|----------------|
| net | `createWebNetBackend` | WHATWG fetch/Response/Headers/AbortController/Blob/TextDecoder | Native HTTP may differ (TLS, proxy, node:http) |
| socket | `createWebSocketBackend` | WHATWG WebSocket | Native socket stack may differ (TLS, buffers, node:net) |
| textsegment | `createWebTextSegmenterBackend` | Intl.Segmenter (ECMA-402) | Native ICU BreakIterator for C/C++ port |

The `set*Backend` seam remains so a native host can override. No `enableHostWeb*` enabler needed — the implementation is already inline.

### Precedence

Three named layers:

| Priority | Layer identity | Installed by | Semantics |
|----------|---------------|-------------|-----------|
| 1 (highest) | `custom` | direct `set*Backend()` by app or host author | Explicit override. Always wins. |
| 2 | `host-web` / `host-node` | `enableHostWeb*()` / future `enableHostNode*()` | Platform-specific provider |
| 3 (lowest) | (absent) | nothing installed | Capability sentinel serves |

For the 3 ambient-language facilities, the lazy-install is the default (layer 3 is not a bare sentinel but the inline implementation). A host override via `set*Backend` still wins.

**Order-independent:** `enableHostWeb*` installs only if no host backend is present. A native host that calls `registerElectronBackends()` first is not clobbered.

**`set*Backend(null)` semantics:** Clears only the custom slot. For host-web capabilities, an installed host is revealed; the sentinel serves only when neither custom nor host exists. For ambient-language capabilities, the inline implementation re-creates on next `get*Backend()` call (current lazy-install behavior preserved).

---

## 3. Precedence Implementation

For host-web capabilities (22 global singletons), the slot model:

```typescript
let _custom: ClipboardBackend | null = null;
let _host: ClipboardBackend | null = null;
let _hostConflict = false;
let _hostObservation: HostObservation | null = null;

export function getClipboardBackend(): ClipboardBackend {
  return _custom ?? _host ?? _sentinel;
}

export function setClipboardBackend(backend: ClipboardBackend | null): void {
  _custom = backend;
}

export function installClipboardHostBackend(backend: ClipboardBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}
```

**First host wins.** `installClipboardHostBackend` never overwrites a previously installed host — same reference is idempotent (no-op), distinct reference sets the conflict flag and preserves the original. `set*Backend(null)` reveals the host layer beneath custom. The host slot is separate from the custom slot.

**Runtime viability is observed, never predicted.** Enablers install a real backend and make no availability claim. Before a real operation, `explain*` reports `unobserved`. Each host operation records whether the runtime API was actually reachable; the last real call replaces the prior observation, so loss and recovery are both visible. A legitimate negative result (permission denied, user cancellation, missing file, zero-ink glyph) is not an unavailable API. Only failure to reach or acquire the required runtime surface records `runtime-api-unavailable`; other failures remain ordinary operation results or defects.

For ambient-language capabilities (3 of them), the existing pattern is structurally unchanged:

```typescript
let _backend: NetBackend | null = null;

export function getNetBackend(): NetBackend {
  if (_backend === null) _backend = createWebNetBackend();
  return _backend;
}

export function setNetBackend(backend: NetBackend | null): void {
  _backend = backend;
}
```

`setNetBackend(null)` sets `_backend = null`, so next `getNetBackend()` re-creates the inline implementation. This is current behavior, preserved.

---

## 4. Mandatory 38-Row Classification

### Method

Each of the 38 `createWeb*Backend` functions was audited in full. The 38 factories implement 328 methods on their returned backend objects: 180 genuine, 148 sentinel. Strict-majority threshold: sentinel > genuine → NONE (no enabler for broad interface). 12 NONE rows. 32 genuine minority methods preserved via narrower split (section 5).

Every implementation inventory governed by this record must be written from a working copy in which the deciding record commit is applied, not merely named. Before authoring, record `git merge-base --is-ancestor <record-commit> HEAD` as a passing precondition and read this file from that working copy.

The inventory must use the record's exact current headings as its schema: `Mandatory 38-Row Classification`, `Capability classification: global-singleton vs per-instance`, `No False Host Implementations`, `Provider-transition lifetime rule`, `Async viability semantics`, and `Repository gates`. Under each heading, every method row cites the exact deciding subsection. A renamed, missing, or superseded heading makes the inventory structurally incomplete; prose restating a remembered rule or a pasted commit hash cannot substitute. Replication may begin only from a complete inventory assembled under this heading skeleton.

### Three outcomes

1. **host-web** (23): genuinely browser-required. Extracted to `@flighthq/host-web`.
2. **ambient-language** (3): standard-JS implementations. Stay inline, structurally unchanged.
3. **none** (11): 6 strict-majority no-op + 5 all-sentinel.

### Complete table

| # | Package | Function | G/S | Outcome | Sub | Evidence |
|---|---------|----------|-----|---------|-----|----------|
| 1 | accessibility | createWebAccessibilityBackend | 5/0 | **host-web** | DOM | document.createElement, element.setAttribute/focus, document.activeElement |
| 2 | app | createWebAppBackend | 9/29 | **none** | — | 76.3% false. 9 genuine; 29 dock/process/login sentinels. |
| 3 | application (loop) | createWebLoopBackend | 3/0 | **host-web** | window | requestAnimationFrame, cancelAnimationFrame, performance.now |
| 4 | application (window) | createWebWindowBackend | 10/18 | **none** | — | 64.3% false. 10 genuine; 18 desktop-window sentinels. |
| 5 | clipboard | createWebClipboardBackend | 18/5 | **host-web** | DOM+window | navigator.clipboard Clipboard API/ClipboardItem/Blob |
| 6 | connectivity | createWebConnectivityBackend | 3/0 | **host-web** | DOM+window | navigator.onLine, fetch HEAD, online/offline events |
| 7 | device | createWebDeviceBackend | 5/0 | **host-web** | window+nav | navigator/screen/devicePixelRatio/localStorage/crypto |
| 8 | dialog | createWebDialogBackend | 6/0 | **host-web** | DOM | window.confirm/alert/prompt, File System Access pickers |
| 9 | filesystem | createWebFileSystemBackend | 21/7 | **host-web** | window | File System Access, navigator.storage |
| 10 | geolocation | createWebGeolocationBackend | 7/0 | **host-web** | nav | navigator.geolocation, navigator.permissions |
| 11 | glyphatlas | createWebGlyphRasterizerBackend | 2/0 | **host-web** | canvas | OffscreenCanvas, Canvas 2D |
| 12 | haptics | createWebHapticsBackend | 9/1 | **host-web** | nav | navigator.vibrate |
| 13 | image | createWebImageBackend | 1/0 | **host-web** | DOM | new Image(), HTMLImageElement.decode/src |
| 14 | interaction | createWebCursorBackend | 1/0 | **host-web** | DOM | HTMLElement.style.cursor |
| 15 | ipc | createWebIpcBackend | 0/4 | **none** | — | ALL sentinel. |
| 16 | keyboard | createWebSoftKeyboardBackend | 4/0 | **host-web** | DOM+window+nav | navigator.virtualKeyboard, Window.visualViewport |
| 17 | lifecycle | createWebLifecycleBackend | 4/0 | **host-web** | DOM+window | document visibility, page lifecycle events |
| 18 | log | createWebLogTransportBackend | 0/1 | **none** | — | ALL sentinel. |
| 19 | mediasession | createWebMediaSessionBackend / createWebMediaSessionActionBackend | 2 slots | **host-web** | nav | Explicit `webHost.media.session` commands and `.sessionAction` events over navigator.mediaSession / MediaMetadata |
| 20 | menu | createWebMenuBackend | 1/2 | **none** | — | 66.7% false. |
| 21 | net | createWebNetBackend | 1/0 | **ambient** | — | WHATWG fetch. Zero navigator/document/window refs. Stays inline, unchanged. |
| 22 | notification | createWebNotificationBackend | 14/4 | **host-web** | window | Notification instances/permission/timers |
| 23 | permissions | createWebPermissionBackend | 2/0 | **host-web** | nav | navigator.permissions.query |
| 24 | platform | createWebPlatformBackend | 1/0 | **host-web** | window+nav | navigator UA/language/touch |
| 25 | power | createWebPowerBackend | 6/7 | **none** | — | 53.8% false. |
| 26 | protocol | createWebProtocolBackend | 3/7 | **none** | — | 70.0% false. |
| 27 | screen | createWebScreenCapabilities | 4 slots | **host-web** | DOM+window | Stable query/change/details/permissionChange slots over Window.screen/ScreenDetails |
| 28 | sensors | createWebSensorsBackend | 17/4 | **host-web** | window | Generic Sensor API, devicemotion/deviceorientation |
| 29 | share | webShareContentBackend / webShareFilesBackend | 3/0 + 3/0 | **host-web** | nav | navigator.canShare/share |
| 30 | shell | webShellExternalBackend | 1/0 | **host-web** | window | Stable Entity over window.open; the eight native-only aggregate methods were deleted. |
| 31 | shortcut | createWebShortcutBackend | 0/7 | **none** | — | ALL sentinel. |
| 32 | socket | createWebSocketBackend | 1/0 | **ambient** | — | WHATWG WebSocket. Stays inline, unchanged. |
| 33 | statusbar | createWebStatusBarBackend | 2/4 | **none** | — | 66.7% false. |
| 34 | storage | webStorageBackend (`local` + `change`) | 6/0 | **host-web** | DOM+window | localStorage, Window storage events |
| 35 | textsegment | createWebTextSegmenterBackend | 1/0 | **ambient** | — | Intl.Segmenter (ECMA-402). Stays inline, unchanged. |
| 36 | tray | createWebTrayBackend | 0/19 | **none** | — | ALL sentinel. |
| 37 | updater | createWebUpdaterBackend | 0/21 | **none** | — | ALL sentinel. |
| 38 | webcam | createWebWebcamBackend | 3/0 | **host-web** | DOM | file-input capture, FileReader, navigator.permissions |

### Summary counts

| Outcome | Count | Modules |
|---------|-------|---------|
| **host-web** | 24 | accessibility, application/loop, clipboard, connectivity, device, dialog, filesystem, geolocation, glyphatlas, haptics, image, interaction, keyboard, lifecycle, mediasession, notification, permissions, platform, screen, sensors, share, shell, storage, webcam |
| **ambient-language** | 3 | net, socket, textsegment |
| **none / strict-majority** | 6 | app (9G/29S), application/window (10G/18S), menu (1G/2S), power (6G/7S), protocol (3G/7S), statusbar (2G/4S) |
| **none / all-sentinel** | 5 | ipc (0/4), log (0/1), shortcut (0/7), tray (0/19), updater (0/21) |

**False concentration:** 11 NONE rows contain 150 methods: 31 genuine, 119 sentinel (79.3%). The other 27 rows: 21 sentinel among 170 (12.4%).

---

## 5. Split-Never-Delete: 32 Genuine Minority Methods

The 7 strict-majority-no-op rows have 32 genuine methods. Each is placed into a narrower, honestly named capability.

### 5.1 app genuine minority (9 methods)

| Method | API evidence | Narrow semantic home |
|--------|-------------|---------------------|
| focus | window.focus | HOST-WEB — browser page/window control |
| quit | window.close (best-effort) | HOST-WEB — attempted close, not process termination |
| relaunch | location.reload | HOST-WEB — page lifecycle |
| getName | document.title | HOST-WEB/DOM — document metadata |
| subscribeReady | microtask / readyState | HOST-WEB/DOM — page lifecycle |
| setBadgeCount | navigator.setAppBadge | HOST-WEB/Navigator — web-app-badge |
| getLocale | navigator.language | HOST-WEB/Navigator — locale preference |
| getPreferredSystemLanguages | navigator.languages | HOST-WEB/Navigator — locale preference |
| getSystemLocale | Intl.DateTimeFormat().resolvedOptions().locale | Ambient-language (ECMA-402) |

### 5.2 application/window genuine minority (10 methods)

| Method | API evidence | Narrow semantic home |
|--------|-------------|---------------------|
| open | browsing context binding | HOST-WEB/Window |
| close | window.close (best-effort) | HOST-WEB/Window |
| focus | window.focus | HOST-WEB/Window |
| setTitle | document.title | HOST-WEB/DOM — document metadata |
| setIcon | favicon manipulation | HOST-WEB/DOM — document metadata |
| getBounds | viewport/screen geometry | HOST-WEB/Window |
| setPosition | window.moveTo (best-effort) | HOST-WEB/Window |
| setSize | window.resizeTo (best-effort) | HOST-WEB/Window |
| center | computed center + moveTo | HOST-WEB/Window |
| setFullscreen | Element.requestFullscreen | HOST-WEB/DOM — fullscreen |

### 5.3 menu genuine minority (1 method)

| Method | API evidence | Narrow semantic home |
|--------|-------------|---------------------|
| popupContextMenu | createElement, getBoundingClientRect, keydown | HOST-WEB/DOM — context-menu popup |

### 5.4 power genuine minority (6 methods)

| Method | API evidence | Narrow semantic home |
|--------|-------------|---------------------|
| isKeepAwakeActive | navigator.wakeLock state | HOST-WEB/Navigator — Screen Wake Lock |
| setKeepAwake | navigator.wakeLock.request | HOST-WEB/Navigator — Screen Wake Lock |
| getStatus | navigator.getBattery | HOST-WEB/Navigator — Battery Status |
| subscribe | BatteryManager events | HOST-WEB/Navigator — Battery Status |
| subscribeResume | page lifecycle `resume` | HOST-WEB/DOM — page lifecycle |
| subscribeSuspend | page lifecycle `freeze` | HOST-WEB/DOM — page lifecycle |

Three families: wake-lock, battery, page-lifecycle. Must not recombine.

### 5.5 protocol genuine minority (3 methods)

| Method | API evidence | Narrow semantic home |
|--------|-------------|---------------------|
| register | navigator.registerProtocolHandler | HOST-WEB/Navigator — protocol registration |
| getRegisteredSchemes | session-local record | HOST-WEB — protocol registration |
| getLaunchUrl | URLSearchParams cold-start | HOST-WEB/Window |

### 5.6 shell genuine minority (1 method)

| Method | API evidence | Narrow semantic home |
|--------|-------------|---------------------|
| openExternal | window.open after caller-owned scheme policy | DELIVERED — stable `webShellExternalBackend` at `webHost.shell.external` |

### 5.7 statusbar genuine minority (2 methods)

| Method | API evidence | Narrow semantic home |
|--------|-------------|---------------------|
| setBackgroundColor | document meta theme-color write | HOST-WEB/DOM — web theme-color |
| getInfo | color read genuine; rest sentinel | HOST-WEB/DOM |

---

## 6. Disposition Questions (settled)

Ten ownership/granularity questions from section 5, all settled.

1. **app.subscribeReady ownership**: Does `subscribeReady` (microtask / readyState) belong in host-web's app-lifecycle narrow capability, or in the existing `lifecycle` package? Affects which enabler installs it.

2. **app.setBadgeCount granularity**: Does `setBadgeCount` (navigator.setAppBadge) get its own narrow enabler (`enableHostWebAppBadge`), or does it join the app-lifecycle narrow capability? Affects tree-shaking granularity — badge is a single API, not a family.

3. **app.getSystemLocale ownership**: `getSystemLocale` uses `Intl.DateTimeFormat().resolvedOptions().locale` (ECMA-402, ambient-language). Does it stay in the app package as an ambient-language inline, or move to the `intl` package? It is the only method in the app backend that is not browser-requiring.

4. **application/window.setFullscreen granularity**: Does `setFullscreen` (Element.requestFullscreen) get its own narrow enabler, or compose into the window-control narrow capability alongside open/close/focus/getBounds/setPosition/setSize/center? Fullscreen is a distinct browser API, but single-method enablers are overhead.

5. **power.subscribeResume / subscribeSuspend ownership**: These use page lifecycle events (`resume`, `freeze`). Do they relocate into the existing `lifecycle` package, or stay as a narrow power-lifecycle capability in host-web? Affects whether page lifecycle events are consolidated.

6. **protocol.getLaunchUrl ownership**: Does `getLaunchUrl` (URLSearchParams cold-start) stay with protocol registration, or move to an application-launch capability? It is not a protocol handler itself.

7. **statusbar.getInfo granularity** (settled: option b): host-web exports/enables only the genuine `setBackgroundColor` (theme-color write). `getInfo` is not exported, not installed, stays sentinel. `explainStatusBarBackend()` reports `{ layer: 'no-host-implementation', viability: 'available' }` for the statusbar capability as a whole — the genuine `setBackgroundColor` is a narrow theme-color capability, not a statusbar host.

8. **Shared document-metadata ownership**: `app.getName` reads `document.title`; `window.setTitle` writes `document.title`; `window.setIcon` writes the favicon. These are the same DOM surface (`document.title` / `<link rel="icon">`) split across two capability packages (app and application). Does document-metadata form one narrow capability spanning both, or does each package carry its own narrow slice? Affects whether a user who installs only the window-control enabler gets `setTitle`/`setIcon` without the rest of app's narrow capability, and vice versa.

9. **Linked lifecycle membership**: `app.relaunch` uses `location.reload` — the same page-lifecycle domain as `app.subscribeReady` and `power.subscribeResume`/`subscribeSuspend`. Does `relaunch` belong in the same lifecycle narrow capability as `subscribeReady`, or does it stay with the app page/window-control group (alongside `focus` and `quit`, which also use `window.*`)? `relaunch` is a navigation act, not an event subscription, so the lifecycle grouping may be semantic rather than API-surface.

10. **Mixed genuine/sentinel power.getStatus**: `getStatus(out: PowerStatus)` fills `batteryLevel`, `chargingTime`, `dischargingTime`, `isCharging` from `navigator.getBattery()` — genuine battery data. But `thermalState`, `isLowPower`, `isOnBattery`, `isBatteryLow` return sentinels (no web API). Does `getStatus` belong in the battery narrow capability despite its sentinel fields? The alternative is splitting `PowerStatus` into battery-genuine and native-only subsets, but `getStatus` is a single call that writes both. Recommendation: keep `getStatus` in the battery narrow capability and document the sentinel fields as platform-absent — the genuine fields are the API contract, and the sentinels are the honest answer for fields no browser can fill.

---

## 7. No False Host Implementations

### Principle (user ruling)

A host must not add inert or degraded methods merely to satisfy a full backend interface. Advertising an outcome the host cannot deliver is a lie.

Absence is a declaration, not an inert implementation. An unsupported optional method is omitted. When a capability can represent no provider directly (as application/loop can), it uses `null` rather than a sentinel object whose required methods do nothing. When a required sentinel object is unavoidable, its return values must be the capability's documented absence values; it must not grow optional members or methods that claim unsupported power. Moving a no-op to `backend.method?.()` does not cure it.

The deciding test is honest member semantics, not a mechanical genuine/sentinel census label and not optionality alone: a member must not claim an outcome it does not deliver. Haptics `prepare` remains present because doing nothing is a truthful fulfillment when the platform has nothing to preallocate. Haptics `vibrateWaveform` is omitted because degrading to plain vibration discards amplitudes and repeat while claiming the requested waveform outcome. The census summarizes prior judgments; it does not decide the next member by analogy.

Filesystem applies this rule through an honest split. `FileSystemHostBackend` contains only the 21 genuine host methods; host-web never implements the seven symlink, permission, watch, and well-known-path absence members merely to satisfy the 28-member capability shape. The filesystem capability owns the full public surface and composes the narrow host provider with its seven documented absence results. Per-operation `explain*` identifies those operations as having no host implementation. A host author implementing `FileSystemHostBackend` therefore implements only power the host actually provides.

The same narrow honest-provider composition applies to clipboard (18 genuine / 5 absence), notification (14 / 4), and sensors (17 / 4). Their capability packages own the full public surfaces and documented absence results; host-web supplies only members whose outcomes the web platform can deliver. Haptics is the semantic exception above: keep honest `prepare`, omit dishonest `vibrateWaveform`, regardless of their census labels.

### Sentinel ownership

When a legacy required interface makes a sentinel unavoidable, that sentinel belongs to the **capability package**, not to any host. Its methods may return only documented absence values. A host must not copy the sentinel, add optional unsupported members, or present an inert implementation as host power.

### Capability classification: global-singleton vs per-instance

23 web implementations. 22 are **global singletons** with no-arg enablers; 1 is **per-instance**.

| Category | Count | Pattern | Enabler signature |
|----------|-------|---------|-------------------|
| Global singleton | 22 | `enableHostWeb*()` no-arg, installs one global backend | `enableHostWebClipboard()` |
| Per-instance | 1 (Cursor) | Factory takes a caller-owned resource, returns a backend | `createWebCursorBackend(element)` |

Cursor requires an `HTMLElement` owned by the caller (per-`InteractionManager`). A global slot cannot hold it — each interaction manager has its own element. Cursor is a **public factory in host-web's app lane**, not an enabler and not in the umbrella.

Accessibility has graduated from this ambient global-singleton classification. `webHost` publishes the stable Entity `webAccessibilityBackend` at `accessibility.provider`, and `createWebAccessibilityBackend(container?)` remains the fresh/borrowed-root factory. There is no Accessibility enabler or resolver slot: every command takes the selected Host provider explicitly, and `destroyAccessibility(host)` is the required final-release path owned by whoever constructed or shared that provider.

### enableHostWeb() membership

`enableHostWeb()` composes the 19 remaining ambient global-singleton enablers. Cursor is excluded
(per-instance); Accessibility, Clipboard, Connectivity, MediaSession, Screen, and Shell are excluded because
they are stable explicit `webHost` slots.

```typescript
export function enableHostWeb(): void {
  enableHostWebAudio();
  enableHostWebAudioDevice();
  enableHostWebBitmapEncode();
  enableHostWebBitmapReadback();
  enableHostWebDevice();
  enableHostWebFileSystem();
  enableHostWebFontLoading();
  enableHostWebGeolocation();
  enableHostWebGlyphRasterizer();
  enableHostWebImage();
  enableHostWebSoftKeyboard();
  enableHostWebLifecycle();
  enableHostWebPermission();
  enableHostWebPlatform();
  enableHostWebRaster2DSurface();
  enableHostWebSensors();
  enableHostWebStorage();
  enableHostWebVideoCapability();
  enableHostWebWebcam();
}
```

Not included: Accessibility, Clipboard, Connectivity, MediaSession, Screen, and Shell (explicit `webHost`
slots), Cursor (per-instance factory, not an enabler), ipc, log, shortcut, tray, updater (all-sentinel),
app, application-window, menu, power, protocol, statusbar (strict-majority no-op), net, socket,
textsegment (ambient-language, inline).

---

## 8. Idempotence and Teardown

### Enabler idempotence

```typescript
let _enabled = false;
export function enableHostWebClipboard(): void {
  if (_enabled) return;
  _enabled = true;
  installClipboardHostBackend(createWebClipboardBackend());
}
```

Second call allocates nothing, preserves provider identity. The enabler's own `_enabled` flag prevents even the allocation of a backend object on repeated calls. The install function's first-host-wins semantics provide a second layer of idempotence at the capability level.

### Factory construction: proven lazy, closure state acknowledged

All 38 `createWeb*Backend` factories were audited. None attach an `addEventListener`, start a `setTimeout`/`setInterval`, or initiate async work (`Promise`/`await`) at construction. Every factory returns an inert object whose methods are callable but passive until a consumer invokes them.

Seven of the 38 factories allocate closure state — mutable variables captured by the returned object's method closures (not exhaustive per-variable — representative types shown):

| Factory | Closure state (representative) | Types present |
|---------|-------------------------------|---------------|
| accessibility | `elements`, `liveRegions`, `root`, `rootResolved` | Maps (to HTMLElement), nullable DOM element ref, boolean |
| screen | `_cursorX/Y`, `_cursorTracking`, `_cachedScreens`, `_screenDetails` | primitives, nullable array, nullable ScreenDetails object ref |
| notification | `_live`, `_requests`, 5 listener callbacks, `_scheduled`, `_idCounter` | Maps (to Notification DOM instances), Sets, config objects (`{ timeout, entry }`), primitive |
| lifecycle | `_windowFocused` | boolean |
| power | `cachedLevel`, `cachedCharging`, `cachedChargingTime`, `cachedDischargingTime` | primitives (numbers, boolean) |
| protocol | `_registeredSchemes` | string array |
| updater | `_config`, `_channel` | config object (UpdaterConfig: 3 booleans), string |

Closure state spans primitives, Maps, Sets, arrays, config objects, and retained DOM/object references. All are passive allocation — no listener registration, no timer, no I/O at construction. Construction being passive does not settle lifetime ownership. Accessibility no longer has a shadow transition: each explicit provider owns its DOM and required idempotent `destroy()` removes it; the constructor/sharer owns the final `destroyAccessibility(host)` call.

### Provider-transition lifetime rule

The deciding line is lifetime, not who happens to own an object:

- **Unbounded relationships rebind.** Scope is structural: any unbounded subscription or watch returning an unsubscribe thunk rebinds, including notification, storage, filesystem watch, clipboard, sensors, screen, lifecycle, connectivity, keyboard, and geolocation. This list is illustrative, not exhaustive. On provider swap, detach from the old provider first, then attach the same caller handler to the new provider. The registry must remove entries on unsubscribe and be empty after the last unsubscribe; the old provider must not emit after the move.
- **Bounded pending operations finish where they started.** A picker, share request, file read, or similar one-shot operation cannot coherently transfer mid-flight. It may complete on the originating provider, but must settle and release its resources. This is a bounded exception to shadow-inertness, not permission for an old provider to remain live indefinitely.
- **Caller-held provider resources survive where transfer is impossible.** Shadow-inertness may be excepted when the caller knowingly holds and controls the surviving resource. Filesystem watches are ordinary unbounded relationships and rebind when a provider supports them. A stream-acquisition promise is bounded and completes on its originating provider; once resolved, the provider-specific stream remains open there until its caller closes or aborts it. It must not be transferred or force-closed on a provider swap, because doing so can destroy caller data. Accessibility now expresses its different ownership directly: the selected Host provider owns its DOM until the constructor/sharer invokes final teardown.

The required transition test is observable: subscribe, swap, emit from the new provider and observe the original handler; then emit from the old provider and observe nothing. The old provider's listener count must return to zero after the swap. Attach-new-before-detach-old is forbidden because it creates a double-delivery window.

Every rebind test must use provider-distinct backends with independently observable listener registries and emitters. Two web backend instances that share `window` are effectively A/A, not A/B: their common event source can mask a stranded subscription and make a broken transition appear to pass. Existing and new transition tests, including notification tests, are invalid as rebind proof if provider identity cannot be distinguished.

Measured provider-distinct evidence currently separates four cases:

- **Storage passes:** after A→B, B delivers, A does not, and A has zero listeners. Its capability-owned signal already detaches old before attaching new; no repair is required.
- **Clipboard fails both halves:** B does not deliver, A still does, and A retains one listener. The capability-owned registry is a non-enumerable `WeakMap`, so the setter cannot migrate live watches. Repair requires an enumerable registry. This deliberately trades WeakMap's automatic leak resistance for rebindability, so entries must be removed explicitly on unsubscribe and tests must prove the registry empties. A source comment must preserve this rationale.
- **Notification fails both halves:** five factory-owned listener Sets strand handlers on the old provider. It requires a capability-owned rebind registry before host-web extraction.
- **Filesystem watch is unexercised on web:** the web method is a sentinel that never emits. The rule is normative, but its first real proof belongs to a supporting native host and must not be counted as web-verified.

Accepted caller-held exceptions must also be observable. `explain*` reports the number of retained caller-held resources that remain on previous providers; filesystem increments the count for resolved streams and decrements it when they close or abort. Correctly rebound listener registries never contribute to this count: their old-provider listener count must be zero. A nonzero retained-resource count therefore means deliberate caller-held ownership, not invisible residue.

---

## 9. explain* Diagnostic

### Orthogonal return type

```typescript
export interface BackendExplanation {
  readonly conflict: boolean;
  readonly layer: 'custom' | 'host' | 'host-not-enabled' | 'no-host-implementation';
  readonly operation: string | null;
  readonly retainedPreviousProviderResources: number;
  readonly viability: 'unobserved' | 'available' | 'runtime-api-unavailable';
}
```

The fields answer separate questions. **Layer** says what is installed or selected. **Viability** says what the last real host operation observed about runtime API reachability. **Conflict** records a rejected second host without replacing the first. **Operation** names the real operation that produced the observation, or is `null` while unobserved. **Retained previous-provider resources** counts accepted caller-held resources still keeping a shadowed provider live; it is zero when none remain. The type is shared across all capabilities in `@flighthq/types`.

### Layer semantics

- **`custom`** — direct `set*Backend()` active. Always wins (highest priority).
- **`host`** — `enableHostWeb*()` installed a host backend.
- **`host-not-enabled`** — a genuine web implementation exists but has not been enabled. Sentinel serves.
- **`no-host-implementation`** — no web implementation exists for this capability (NONE rows: ipc, log, shortcut, tray, updater, and statusbar.getInfo). Sentinel serves.

### Viability semantics

- **`unobserved`** — no real host operation has established runtime reachability. This is the initial value after installation and for the two no-active-host layers.
- **`available`** — the last real operation reached or acquired the required runtime API. It does not promise that the requested outcome succeeded.
- **`runtime-api-unavailable`** — the last real operation could not reach or acquire the required runtime API. A later operation may replace this observation with `available` after recovery.

Provider conflict is not viability. Two distinct host backends attempting to install sets `conflict: true`, preserves the first host, and leaves the last operation observation unchanged. Custom still wins; clearing custom reveals the original host.

### Async viability semantics

Promise settlement is not a viability predicate. An absent API or failure to acquire its required runtime surface records `runtime-api-unavailable`. User cancellation, permission denial, a missing file, an unsupported requested datum, or another legitimate negative result proves that the capability surface was reached and records `available`; the operation returns or throws its ordinary result. A genuine implementation error is a defect, not a capability statement, and must not be relabelled as runtime unavailability. In particular, a blanket `try/await => available; catch => unavailable` implementation is forbidden.

### Five reachable states

| # | Installed/selected state | Runtime observation | explain* core report |
|---|--------------------------|---------------------|----------------------|
| 1 | Custom active | Not a host reachability claim | `{ layer: 'custom', viability: 'unobserved' }` |
| 2 | Host active | No real operation yet | `{ layer: 'host', viability: 'unobserved' }` |
| 3 | Host active | Last operation reached the API | `{ layer: 'host', viability: 'available' }` |
| 4 | Host active | Last operation could not reach/acquire the API | `{ layer: 'host', viability: 'runtime-api-unavailable' }` |
| 5 | No active host | Enabler exists or no host implementation exists | `{ layer: 'host-not-enabled' | 'no-host-implementation', viability: 'unobserved' }` |

Every report additionally carries `operation`, `conflict`, and `retainedPreviousProviderResources`. `operation` is `null` in states 1, 2, and 5 and names the observing call in states 3 and 4. `conflict` is an independent boolean on every state; it never changes `layer`, `operation`, or `viability`. `retainedPreviousProviderResources` is likewise independent: normally zero, and nonzero only for accepted caller-held resources such as filesystem streams that remain open on an originating provider after a swap.

For ambient-language capabilities (net, socket, textsegment), no explain*Backend is needed — the inline implementation always serves unless overridden by `set*Backend`.

---

## 10. Types Spine: lib.dom Census

### Measured: 56 lib.dom-bearing files in packages/types/src/ (249 type-position sites)

Partitioned: 40 render/backend headers carrying 224 sites (expected — these are the Canvas/GL/WGPU/DOM render-tier types). 16 nominal-neutral files carry 25 lib.dom sites (the extraction surface).

### Disposition rule

No lib.dom/lib.webworker symbols in neutral types files — including AbortSignal/Blob even though Node also exposes them. Replace with neutral protocols or opaque handles.

### Complete table (16 files, 25 sites)

| # | File | lib.dom types | Disposition |
|---|------|--------------|-------------|
| 1 | Scene2DResources.ts | AbortSignal (4), AudioContext (1) | AbortSignal → **neutral protocol**. AudioContext → **opaque handle**. |
| 2 | Scene3DResources.ts | AbortController (1), AbortSignal (1) | → **neutral protocol**. |
| 3 | ImageResourceReference.ts | AbortSignal (1) | → **neutral protocol**. |
| 4 | AudioResourceReference.ts | AbortSignal (2) | → **neutral protocol**. |
| 5 | AudioResource.ts | AudioBuffer (1) | → **opaque handle**. |
| 6 | FontResource.ts | FontFace (1) | → **opaque handle**. |
| 7 | ResourceLoadItem.ts | AbortSignal (1) | → **neutral protocol**. |
| 8 | Connectivity.ts | AbortSignal (1) | → **neutral protocol**. |
| 9 | Image.ts | AbortSignal (1) | → **neutral protocol**. (ImageBitmap appears only in a comment, not a type position.) |
| 10 | Net.ts | AbortSignal (1), Blob (1) | AbortSignal → **neutral protocol**. Blob → **opaque handle**. |
| 11 | FileSystem.ts | ReadableStream (1), WritableStream (1) | → **opaque handle** or **neutral protocol**. |
| 12 | NativeText.ts | HTMLElement (1) | **Move** to render-tier. |
| 13 | WebcamStreamRuntime.ts | MediaStream (1), HTMLVideoElement (1) | **Move** to host-web-tier. |
| 14 | HtmlView.ts | HTMLElement (1) | **Move** to render-tier. |
| 15 | ShapeRasterizer.ts | CanvasRenderingContext2D (1) | **Move** to render-tier. |
| 16 | HostImageSource.ts | CanvasImageSource (1) | **Move** to render-tier. |

### DOM-free proof

```bash
npx tsc --project packages/types/tsconfig.neutral.json --lib es2022 --noEmit
```

Defeating fixture ensures the check is real.

---

## 11. Target Shape: One Immediate Package

### @flighthq/host-web (created in Phase 3)

Contains 23 genuine browser-required web backend implementations: 22 global-singleton enablers, 1 per-instance factory (Cursor), and `enableHostWeb()`.

```
host-web/
  src/
    index.ts          — public lane: enableHostWeb, 22x enableHostWeb*, createWebCursorBackend
    contract.ts       — contract lane: 23x createWeb*Backend factories
    enableHostWeb.ts  — composes all 22 global-singleton enablers
    webAccessibility.ts
    webClipboard.ts
    webCursor.ts      — per-instance factory only (no enabler)
    ... (23 files, one per genuine capability)
```

DOM-requiring vs navigator-only is a classification INSIDE host-web. A later worker split is a file move, not a redesign.

### Ambient-language capabilities (stay inline, unchanged)

Net, socket, textsegment remain in their capability packages. No renames, no extraction, no enablers. The lazy-install pattern is preserved as-is.

### host-node (charter only, sole reserved-for-construction host)

Charter: `agents/packages/host-node/charter.md`. NOT created until first genuine backend. `host-node` is the sole host package reserved for construction in this monorepo — it is where the first headless (Node/Deno/Bun) backends will land when they are built.

### Downstream hosts (chartered here, built elsewhere)

`host-lime` (`downstream: flight-hx`) is chartered in this repo for naming and architecture authority, but its implementation is built in the `flight-hx` repository. This monorepo defines the charter and interface conventions; it does not create or populate the package.

---

## 12. Install Trigger

Static explicit `enableHostWeb*()` calls at app startup. No lazy-install, no dynamic `import()`, no runtime detection.

Zero dynamic `import()` calls exist in non-test production sources of capability and host packages (`packages/{capability,host-*}/src/*.ts`, excluding `*.test.ts`). Two exclusion categories: `tool-*` packages (`tool-capture` uses `await import('@playwright/test')` for Playwright integration), and test files within capability packages (`ipc.test.ts`, `notification.test.ts` use dynamic imports for test isolation). The zero-dynamic-import invariant is a design constraint on the production capability/host boundary, not a repo-wide absolute.

---

## 13. Bundle Evidence (Acceptance Blocker)

Actual measured bundle sizes are an acceptance blocker.

### Post-extraction measurement plan

| Fixture | What it proves |
|---------|---------------|
| 1 granular enabler | `enableHostWebClipboard` + `readClipboardText` → only clipboard web backend + contract |
| 3 granular enablers | clipboard + platform + storage → only those 3 |
| enableHostWeb() | All 23 genuine → all 23 backends |
| Native contract-only | `readClipboardText` without any enable call → contract only, zero web backend |
| Isolation | `enableHostWebClipboard` only → must NOT pull any other enabler |

**Method:** Disposable fixture examples, built with project Vite tooling, measured with `npm run size`.

---

## 14. Export and Policy

### host-web exports

| Lane | Exports |
|------|---------|
| Public (index.ts) | `enableHostWeb`, 22x `enableHostWeb*`, `createWebCursorBackend` |
| Contract (contract.ts) | 23x `createWeb*Backend` factories |

### Capability package changes

Each of the 23 host-web capability packages:
- **Removes** its `createWeb*Backend` function (moved to host-web contract).
- **Keeps** `get*Backend` / `set*Backend` in its contract lane.
- **Gains** `installHost` + `getHostIdentity` in contract lane.
- **Changes** `get*Backend()` to use custom → host → sentinel precedence.

The 3 ambient-language packages: no structural change.

### SDK barrel re-exports

`enableHostWeb` and all 22 `enableHostWeb*` re-exported from `@flighthq/sdk`. `createWebCursorBackend` NOT re-exported (host-* packages are outside the SDK barrel). Factories NOT re-exported.

### sideEffects

`host-web`: `"sideEffects": false`.

### Policy

AGENTS.md host-* family adds host-web (future host-node). Both outside SDK barrel package. `scripts/sdk-policy.ts` enforces.

### Repository gates

| Gate | Enforces |
|------|----------|
| `npm run packages:check` | Package shape, manifests, exports |
| `tsc --lib es2022` on neutral types | No lib.dom in neutral types |
| `npm run size` (acceptance fixtures) | Measured isolation |
| `npm run exports:check` | Every enabler has a colocated test |
| `npm run portable:check` | No forbidden globals in capability roots |
| Precedence invariant test | All call orderings produce same state |
| Provider-conflict test | Two host identities for same capability reports conflict |

---

## 15. Migration Sequencing

1. **Add precedence infrastructure to 23 host-web capability packages** — custom/host slots, `installHost`, `getHostIdentity`. Change `get*Backend` to custom → host → sentinel.

2. **Delete the 5 all-sentinel backends** (ipc, log, shortcut, tray, updater) — factory removed, sentinel serves.

3. **Create host-web package** — standard shape. `npm run packages:check`.

4. **Extract 2 worked examples** (interaction, glyphatlas) into host-web. `npm run size`.

5. **Extract remaining 21 host-web backends**.

6. **Handle 7 strict-majority rows** — factories removed. Narrow-split disposition per section 6 questions.

7. **Add enableHostWeb()** + 22 per-capability enablers and the per-instance Cursor factory.

8. **Update SDK barrel**.

9. **Types spine cleanup** — neutral protocols, opaque handles, render-tier moves. `tsc --lib es2022`.

10. **Update AGENTS.md** — host-web, ambient-language clarification.

11. **Acceptance fixtures** — 5 fixtures per section 13. Measured bytes.

12. **Precedence tests** — order-independence, idempotence, reveal-on-clear, provider-conflict.

13. **Final verification** — `npm run check`, `npm run test`, `npm run packages:check`, `npm run size`, `npm run api:check`.

---

## 16. Profiler Proposal (Later Only)

Separately imported `enableHostWebProfiler()`, opt-in/shakeable. Zero tracking cost. Plain-data `explainHostWebUsage()` query. No implementation now.

---

## 17. Companion Document Patches (landed)

Two prerequisite commits are now on base, completing the documentation reconciliation:

- **`3a445a37c`** `docs(agents): reserve future Node host layer` — created the `host-node` charter at `agents/packages/host-node/charter.md`.
- **`162e62b0f`** `docs: reconcile platform suite docs with host-web extraction model` — patched six repo files:

### Always-available → explicit host installation (3 files)

- **AGENTS.md** — Platform Integration Suite paragraph: "web backend is always available" → explicit `enableHostWeb*()` installation with custom > host > sentinel precedence.
- **agents/packages/catalog.md** — Platform Integration Suite paragraph: same change.
- **agents/packages/platform-integration.md** — Pattern section: same change.

### host-node: soon/bedrock → reserve (charter-only) (3 files)

- **agents/breadth-platform-variance.md** — line 11 (missing headless host), line 48 (candidate table), line 71 (strategic note): "soon" → "reserve (charter-only)" with charter reference.
- **agents/breadth-synthesis.md** — line 65 (soon queue): same change.
- **agents/packages/register.md** — line 254 (recommended candidates): "bedrock" → "reserve (charter-only)".

---

## 18. Decision Summary

### Measured facts

- 37 packages, 38 `createWeb*Backend` functions (application has 2).
- 328 factory-implemented methods (methods on the objects the 38 factories return); 180 genuine, 148 sentinel (45.1% false).
- 12 rows strict-majority no-op: 7 partial (32 genuine methods → narrow split), 5 all-sentinel.
- 23 rows host-web (browser APIs required).
- 3 rows ambient-language (standard JS: fetch, WebSocket, Intl.Segmenter). Structurally unchanged.
- 56 lib.dom-bearing types files total (249 sites): 40 render-backend headers (224 sites, expected) + 16 nominal-neutral files (25 sites — the extraction surface). All 25 neutral sites resolved via neutral protocols, opaque handles, or render-tier moves.
- 0 dynamic imports in non-test production capability and host package sources (test files and tool-* excluded).
- All 38 factories confirmed: no addEventListener, no setTimeout/setInterval, no async/Promise at construction. 7 factories allocate passive closure state spanning primitives, Maps, Sets, arrays, config objects, and retained DOM/object references.

### Design chosen

Phase 3 creates `host-web` only. `host-node` is the sole host reserved for construction in this monorepo (charter-only until first genuine backend); `host-lime` is downstream (`flight-hx`), chartered here for naming authority. 23 genuine implementations: 22 global-singleton enablers + 1 per-instance factory (Cursor). Cursor excluded from `enableHostWeb()` umbrella (umbrella membership = 22). 3 ambient-language facilities stay inline, structurally unchanged. 12 NONE rows: 5 all-sentinel (factory deleted), 7 split-never-delete (32 genuine methods, 10 ownership questions settled in section 6). Precedence: custom > host > sentinel. `set*Backend(null)` reveals host layer beneath custom. Enablers truly idempotent (second call allocates nothing, preserves provider identity). Distinct second host does not last-write-win: the original is preserved and `conflict` reports the rejected install independently. explain* separates installed layer, last observed runtime reachability, observing operation, and conflict. Viability is observed by real operations, never probed at enable time and never inferred from operation success. Unbounded relationships rebind across provider transitions; bounded pending operations complete where they started. Bundle acceptance fixtures required.

## 2026-08-30 append — Power on web, and the four members that were not there

`enableHostWebPower` is gone with the rest of the ambient family; the web providers are plain consts
composed into `webPowerCapabilities`.

Web offers FOUR power slots — `status`, `change`, `keepAwake`, `suspension` — and omits `idle`,
`sessionLock`, `batteryHealth` and `thermal`. It previously implemented all of them: four subscriptions
were `return () => {};` and the idle/battery/thermal queries answered a constant `'Unknown'`/`-1`/`null`.
Structurally that was indistinguishable from a real implementation, and core polled the constant idle
state on a timer that could never fire a transition. An omitted slot is the honest report.

`suspension` is genuinely real on web: `freeze` and `resume` are the spec'd Page Lifecycle pair, both
fire, and both unsubscribe cleanly. An earlier inventory of mine claimed web had "suspend only" — that
was wrong; `subscribeResume` was wired the whole time.

Keep-awake awaits `navigator.wakeLock.request` and classifies the failure: `NotAllowedError` /
`SecurityError` become `denied`, anything else `failed`, and an absent API or the
`PreventAppSuspension` mode become `unavailable`. The battery readings live in the provider's own
closure rather than at module scope, so a destroyed provider's last readings can no longer be served to
its successor as if freshly measured.

---

## 19. Shortcut explicit-Host correction (2026-08-30)

The historical shortcut rows above correctly found zero browser implementation, but their remaining
sentinel/ambient-installation wording is superseded. `webHost` now carries the required top-level
`shortcut` group as exact `{}`. Because neither query nor trigger registration exists in browsers, it
publishes neither optional provider. There is no `createWebShortcutBackend`, `enableHostWebShortcut`,
ambient slot, explain/observe surface, or sentinel implementation. Host probing derives support from the
presence of an actual provider, so the empty group remains structurally unsupported.
