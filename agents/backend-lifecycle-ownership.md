# Backend lifecycle ownership

_Reconciled architecture record, 2026-08-28. The original audit population is frozen at 42
`*Backend` interfaces so its partition remains reproducible. A post-audit population change is
recorded separately below._

## Result

The 42-interface audit partitions exactly as:

```text
1 already-implemented whole-backend owner (LogTransport)
+ 7 additional whole-backend owners still needing hooks at the audit freeze
+ 19 entity/keyed/caller-owned lifetimes
+ 15 GC-managed, pure, or bounded-call backends
= 42 audited interfaces
```

The seven still-needing rows are not the total owner population. At the frozen audit, the total was
eight: already-implemented `LogTransportBackend` plus the seven named below. Since that audit,
`AccessibilityBackend` and `MediaSessionBackend` have landed their hooks. The live implementation
state is therefore five declared and exercised hooks (`AccessibilityBackend`, `LogTransportBackend`,
`MediaSessionBackend`, `MenuBackend`, and `PowerBackend`) with three still owed.

The live tree has since added four interfaces. `AudioBackend` is a pure `canPlayType` query and
joins the GC/bounded bucket. `WgpuHostBackend` and `InputIngressBackend` own acquisition- or
registration-scoped brackets, so they join the entity/keyed/caller-owned bucket. `AudioDeviceBackend`
landed after this record first anticipated it, and its shape settles it: every resource it makes is
handle-keyed with its own teardown (`createDevice`/`destroyDevice`, `createBuffer`/`destroyBuffer`,
`createSource`/`destroySource`) and it declares no zero-argument teardown, so it joins the
entity/keyed/caller-owned bucket by the same rule that places `TrayBackend.destroy(id)` there.

Therefore the live total is 46 and the live partition is `1 + 7 + 22 + 16 = 46`. None of the
post-audit rows changes the whole-owner population, which remains eight — so 8 − 5 = three still owed.

### Provenance of the live figures

These numbers are re-derived, not carried forward. The `42` above is the frozen audit population and
is deliberately never updated; the figures in this section track the live tree and move with it.

- **command** — `npx vitest run scripts/backend-lifecycle.test.ts` (`scripts/backend-lifecycle-core.ts`)
- **tree** — `bd6f4a8768d290641bd8eb33c9ce8b44094f2d83`, clean
- **scope** — every exported `*Backend` interface in `packages/types/src/*.ts`, plus every exported
  `set*Backend` body and top-level function body in `packages/*/src/*.ts`; `*.test.ts` excluded
- **counting predicate** — one unit = one interface; *owning* = declares a **zero-parameter**
  `destroy`/`dispose` in method or property syntax, so a per-object teardown taking an id is excluded
- **live output** — `5 of 46 backends own a freeable resource, 41 declare no whole-backend teardown`

The census partition (`5 + 41 = 46`) counts a different thing from the bucket partition
(`1 + 7 + 22 + 16 = 46`) above it: the census asks only whether a zero-argument hook is *declared*,
while the buckets record which lifetime *should* own cleanup. They agree on the denominator and on
nothing else, which is the point — the gate cannot supply the semantic column.

## Derivation rules

A backend needs a zero-argument `destroy?(): void` when its implementation does either of these:

- retains a releasable external/native object beyond the operation that acquired it; or
- installs persistent state into a host singleton and no provider-pinned entity, key, unsubscribe
  thunk, or caller-owned command lifetime owns the bracket.

`destroy` means that a non-GC resource or persistent host effect is freed and the backend becomes
invalid. `dispose` remains the entity verb: detach listeners and references so an entity is eligible
for collection. A parameterised operation such as `TrayBackend.destroy(id)` frees one keyed object;
it is not a whole-backend hook.

Entity/keyed classification is not a declaration that cleanup is finished. It answers only which
lifetime should own cleanup. Each row below separately says whether the current implementation pins
cleanup to the originating provider or still owes that provenance.

Provider replacement follows five invariants:

1. Teardown is idempotent and exactly once for each ownership loss.
2. Installing the identical backend again does not destroy it.
3. If the same object occupies more than one precedence slot, losing one slot does not destroy the
   object while another slot still owns it.
4. Teardown happens before install: the outgoing backend is destroyed while it is still the selected
   backend (`get*Backend()` returns it during its `destroy()` call), so teardown code that queries the
   active backend sees itself.
5. If teardown throws, the replacement is not installed and the outgoing backend remains the selected
   last-known-good backend, preserving ownership for retry or explicit documented recovery.

**Shared origin-pinned lifecycle doctrine (normative):** cleanup releases only the resources or
registrations acquired by the originating backend for that exact acquisition/source. Later backend
selection cannot reroute that cleanup, and a caller-supplied source or handle is borrowed and never
destroyed. This governs whole-backend teardown and every entity-, registration-, or acquisition-scoped
release: whole-backend teardown, WebGPU host acquisition, input ingress attachment, and Window
open/attach are concrete instances of the same rule.

The structural ratchet in `scripts/backend-lifecycle-core.ts` derives exported backend names, finds
zero-argument `destroy`/`dispose` members in both method and callable-property syntax, excludes
parameterised teardown, and checks that the corresponding `set*Backend` body references the hook.
`scripts/backend-lifecycle.test.ts` asserts `enforced + noTeardownHook === total` and holds two
separate lists: an immutable `HISTORICAL_BASELINE` (the three names and total of 43 recorded when the
gate was established, never updated, so growth shows as signed deltas such as `+3 new seams,
+2 newly enforced`) and the current ratchet of every backend that has landed a hook, which gates the
full present set and must never shrink.

That gate is intentionally a ratchet, not an ownership oracle. It can prevent a declared hook from
silently disappearing, but it cannot infer that a hook is missing: absence of the declaration places
an interface in `noTeardownHook`. The manually audited partition in this record supplies that missing
semantic evidence.

## Whole-backend owners

### Existing owner: LogTransportBackend

`LogTransportBackend` may retain a file descriptor, socket, or native writer. Its optional
`destroy()` is implemented by `destroyLogTransportBackend`: the slot is cleared before `flush()` and
`destroy()` run, so later file-sink writes cannot reach a freed transport and repeated teardown is a
no-op. `setLogTransportBackend` preserves identical-object assignment and destroys a different or
removed outgoing transport. This is the complete single-slot reference implementation.

### Seven additional owners

All seven rows needed a hook at the 42-interface audit freeze. `MediaSessionBackend` is retained in
this seven-row population because implementation progress changes a row's state, not its ownership
category; its subsequently landed hook is recorded in the row itself.

| Backend | Evidence for whole ownership | Required or current teardown |
| --- | --- | --- |
| `AccessibilityBackend` | `createWebAccessibilityBackend` retains mirrored DOM nodes, live regions, and sometimes an owned root appended to `document.body`. | **Landed hook:** web `destroy()` clears mirrored nodes and live regions, removes only a backend-created root, empties but preserves a caller-supplied container, and cannot lazily recreate a root afterward. Custom/host slots release only objects no longer referenced by either slot and deduplicate aliased final removal. |
| `AppBackend` | A backend can hold the process single-instance lock and start dock/attention requests; its event thunks alone do not release those host resources. | **Owed:** each implementation tracks locks and request ids it acquired; `destroy?()` releases its lock, cancels outstanding attention/bounce ids, and detaches any instance-owned host state. Durable user configuration such as login-at-startup is not rolled back merely because an adapter is replaced. |
| `MediaSessionBackend` | Metadata, playback state, scrubber state, and action handlers remain installed on the OS `mediaSession` singleton after the adapter reference is dropped. | **Landed hook:** web `destroy()` clears its registered action set, metadata, playback state, and position state. `setMediaSessionBackend` covers custom-slot replacement/removal. The two-slot final-loss/alias cases remain evidence still to add: `destroyMediaSessionBackend` currently clears both slots after invoking only the active object, and a host object aliased into the custom slot can be destroyed while the host slot still retains it. |
| `MenuBackend` | `setApplicationMenu` installs a process-global native menu whose callbacks can retain the backend selection listener. Popup menus are bounded caller promises and are not the reason for the hook. | **Landed hook, one behavior still owed:** `destroy?()` on the interface; `setMenuBackend` destroys the outgoing backend before installing the replacement (invariants 1–5). Electron and Tauri null the select listener; web is a no-op (holds no state, and its `setApplicationMenu` returns `false`). Still owed: no backend clears the installed application menu on teardown — `Menu.setApplicationMenu(null)` appears nowhere in `packages/host-*/src`, so a replaced Electron backend leaves its native menu in place. The structural census cannot see this, since the hook is declared and invoked. |
| `PowerBackend` | Electron retains a `powerSaveBlocker` id; web retains and may reacquire a `WakeLockSentinel`. Both outlive the initiating call. | **Landed hook:** `destroy?()` on the interface; `setPowerBackend` destroys the outgoing backend before installing the replacement (invariants 1–5). Electron stops any held power-save blocker; web releases the wake-lock sentinel. Entity subscriptions remain owned by `detachPower`/`disposePower`. |
| `ScreenBackend` | `createWebScreenBackend.ensureCursorTracking` installs one anonymous process-lifetime `pointermove` handler and retains cursor/cache/detail state outside any `ScreenSignals` entity. | **Owed:** retain the exact handler, remove it in idempotent `destroy?()`, detach any backend-level Screen Details listeners, and clear retained detail/cache state. Per-entity `subscribe` thunks continue to detach their own resize/orientation listeners. |
| `ShortcutBackend` | Successful registrations install OS-global callbacks and the Electron backend retains their accelerator set. They survive loss of the adapter reference. | **Owed:** `destroy?()` calls the implementation's `unregisterAll()` and clears its owned registry. Async hosts must observe/reject teardown failures without leaving an unhandled promise. |

The landed `AccessibilityBackend` and `MediaSessionBackend` hooks raise the structural gate to three
owners, but the layered-slot caveat above is why “gate enforced” and “all lifecycle cases proven” are
recorded separately.

## Entity, key, rebind, or caller-owned lifetimes

The result column uses **owned** only when the current path reaches the originating resource. **Owed**
names the exact provenance or cleanup work still required; it does not promote the backend to a
whole-owner.

Rows 1–19 reproduce the frozen audit population. Rows 20–22 are the post-audit
`WgpuHostBackend`, `InputIngressBackend`, and `AudioDeviceBackend` additions.

| # | Backend | Exact resource bracket and provenance | Result |
| ---: | --- | --- | --- |
| 1 | `WindowBackend` | **Per-entity host teardown:** successful open/attach binds each `ApplicationWindow` to its originating backend, whose adapter record retains the native handle, ownership (`flight` or `host`), and exact listener cleanup. Close through that backend removes forward/reverse identity plus native event ingress and destroys only a Flight-owned handle. **Entity-dispose reachability:** after the terminal `onClose` emits once, `disposeApplicationWindow` drains the separate application observer map so its closures cannot retain the entity. | **Owned.** Host teardown precedes the terminal signal; observer disposal follows it. Backend replacement cannot redirect either cleanup, synchronous native/facade close converges at one choke point, duplicate close is a no-op, and successful reopen re-arms both obligations for the next entity lifetime. |
| 2 | `ClipboardBackend` | `attachClipboardWatch` stores the exact unsubscribe thunk. `detachClipboardWatch`/`disposeClipboardWatch` invoke it, and `rebindClipboardWatches` unsubscribes before subscribing through a replacement. | **Owned.** Cleanup and replacement both reach the provider that created the subscription. |
| 3 | `ConnectivityBackend` | `attachConnectivity` captures the backend's unsubscribe thunk in the `Connectivity` side table; `detachConnectivity`/`disposeConnectivity` invoke it. A reachability probe is bounded by its promise, timeout, and optional `AbortSignal`. | **Owned.** An attached entity may intentionally stay pinned to its creator until detached; replacement semantics are not a resource leak. |
| 4 | `CursorBackend` | A backend is held by one `InteractionManager`; web `setCursor(null)` is the exact restoration (`element.style.cursor = ''`). No manager teardown calls it. | **Owed:** add a manager release/clear path that calls its pinned backend's `setCursor(null)` before dropping the backend, then clears pointer/capture state. Dropping a hovered manager currently leaves the host cursor mutation behind. |
| 5 | `DialogBackend` | Picker promises own transient UI. Returned `FileDialogHandle` objects key native web handles in `WeakMap`s; the browser handle contract has no close operation and the entries disappear with the caller's handle. Blob/file streams are owned by filesystem operations, not the dialog backend. | **Owned by call/GC.** Settle/cancel the picker and drop the returned handle; there is no backend-wide resource to destroy. |
| 6 | `FileSystemBackend` | `watchPath` returns the originating backend's unsubscribe thunk directly. Returned readable streams are cancelled by the reader; writable streams are closed or aborted by the writer (`writeBinaryFileChunks` demonstrates both paths). | **Owned by returned handles.** Cleanup never needs to rediscover the active backend. |
| 7 | `GeolocationBackend` | Permission subscriptions return an origin-capturing unsubscribe, but `watchGeolocationPosition` exposes only a provider-local number and `clearGeolocationWatch(id)` routes that number to the currently active backend. | **Owed:** allocate a Flight watch id mapped to `{ backend, providerWatchId }`; clear through the stored backend and remove the entry. On replacement, either keep watches creator-pinned until clear or explicitly clear/recreate them—never send an old numeric id to a new provider. |
| 8 | `ImageBackend` | A load is bounded by its promise and optional `AbortSignal`; blob loads revoke their object URL in `finally`. A settled `Image` carries a **borrowed** `HostImageSource`, whose contract explicitly says the resource never owns or frees it. | **Owned by call/borrower.** Abort an in-flight load; after settlement, the source creator/caller owns any source-specific close and the `Image` wrapper is GC-managed. A future owning native image handle would require an entity disposer and origin provenance. |
| 9 | `IpcBackend` | `onIpcMessage`/`onIpcMessageEvent` wrap and retain the exact backend unsubscribe; `removeAllIpcListeners` invokes those thunks. `onIpcInvoke` returns the backend's unregister thunk directly. | **Owned.** Listener and handler cleanup remain pinned to their registration provider. |
| 10 | `SoftKeyboardBackend` | `attachSoftKeyboard` captures the provider unsubscribe; `detachSoftKeyboard`/`disposeSoftKeyboard` invoke it. Show/hide and style/resize setters are explicit host policy commands, not acquired handles. | **Owned.** No whole-backend external object remains. |
| 11 | `LifecycleBackend` | `attachAppLifecycle` captures both state and memory-warning unsubscribes in one entity cleanup; `detachAppLifecycle` invokes it and `disposeAppLifecycle` also deletes saved state. | **Owned.** Both provider streams are released through their originating thunks. |
| 12 | `LoopBackend` | `startApplicationLoop` captures the chosen backend in a local constant. Every stored loop cleanup calls that same backend's `cancelFrame` with its latest handle; `stopApplicationLoop` and `disposeApplication` invoke the cleanup. | **Owned.** Frame cancellation is origin-pinned even if the global loop backend later changes. |
| 13 | `NotificationBackend` | Listener subscriptions are safely rebound by `registerNotificationSubscription`. Display ids, scheduled ids, and optional channel ids are unqualified strings: `closeNotification`, `cancelScheduledNotification`, `updateNotification`, and `deleteNotificationChannel` all route to the current backend. | **Owed:** map every returned/created id to its provider and kind, then route close/update/cancel/delete to that provider. Replacement must explicitly close/cancel/reconcile outgoing live and scheduled entries; `closeAllNotifications` on only the new provider is insufficient. |
| 14 | `ProtocolBackend` | `ProtocolHandler` owns an exact unsubscribe via `detachProtocolHandler`/`disposeProtocolHandler`. Registered/default schemes are provider-owned keys, but `unregisterProtocolScheme` and `removeProtocolSchemeAsDefault` route to the current backend. | **Owed:** record the provider and successful operations per normalized scheme; unregister/remove-default through that provider or deliberately reconcile durable OS registration on replacement. Event-subscription cleanup is already origin-pinned. |
| 15 | `SensorsBackend` | `attachSensors` combines every returned sensor unsubscribe into one closure; `detachSensors`/`disposeSensors` invoke the full set. Generic Sensor implementations stop the sensor and remove their exact reading handler inside those thunks. | **Owned.** Each sensor stream is released by its creator. |
| 16 | `SocketBackend` | `createSocket` stores the returned `SocketConnection` on `Socket.runtime`. `closeSocket` calls that connection directly; `disposeSocket` closes it, detaches delivery, drops the connection/signals, and marks the entity terminal. | **Owned.** No later lookup of the global backend is required. |
| 17 | `StatusBarBackend` | Event entities retain exact unsubscribe thunks. Style entries have `popStatusBarStyleEntry` and `clearStatusBarStyleStack`, but the global `_baseline`, `_applied`, and stack apply through whichever backend is current. | **Owed:** pin the stack baseline/applied state to its provider. Before that provider is lost, restore its baseline; if entries survive replacement, capture the new provider baseline and reapply them. Keep `detachStatusBar`/`disposeStatusBar` for per-entity subscriptions. |
| 18 | `TrayBackend` | `destroyTrayIcon` first calls `stopTrayIconAnimation`, then sends provider-local `tray.id` to the current backend. `_animations` is keyed only by that id. `onTrayEvent` does return an origin-capturing unsubscribe. | **Owed:** make a tray handle retain provider provenance (or keep an id-to-provider registry), key animations by that ownership identity, and route every query/mutation plus `destroy` to the creator. Then stop the local timer and call that creator's `destroy(id)` exactly once. |
| 19 | `UpdaterBackend` | `AppUpdater` subscriptions retain a combined origin-capturing unsubscribe and `disposeAppUpdater` invokes it. An in-flight download, however, is global backend work while `cancelAppUpdateDownload` routes to the backend active at cancellation time. | **Owed:** retain the backend that started a download (or prohibit replacement while one is active) and send cancellation to it before releasing that command lifetime. Entity subscriptions are already safe; feed/config values are durable policy to reapply, not resources to free. |
| 20 | `WgpuHostBackend` | `acquire` returns a `WgpuHostAcquisition` carrying the presentation context, device, format, and explicit `caller \| flight` ownership. `flight` is valid only for handles the backend created for Flight; `caller` borrows the exact supplied device, context, and native-surface identities. `createWgpuRenderState` retains the acquisition and selected backend in the reference-counted shared device runtime; initialization failure calls the captured backend's `release` immediately, while the last `destroyWgpuRenderState` sharing it calls `release` exactly once. Release unconfigures the context and destroys the device only for Flight-owned handles. For caller-owned handles it may detach Flight bookkeeping but must not destroy the device or destroy/unconfigure the presentation context or native surface, which may remain in use outside Flight. | **Owned.** Cleanup is per acquisition and provider-pinned, including failure and final-reference paths. Replacing the process-global backend cannot reroute an existing acquisition's release; derived-state teardown preserves borrowed caller handles, and no zero-argument whole-backend teardown is appropriate. |
| 21 | `InputIngressBackend` | One process-global backend receives many exact `InputIngressSource` identities. Each of the six attachment families returns an opaque release retained by `_inputBindings` under `(InputManager, source, family)`; the Web adapter's releases remove the exact listener records they installed. The backend selection is independent of `Application` and is not stored per source. | **Owned under the shared doctrine above.** Same-key replacement and detach consume the stored release exactly once, backend replacement cannot redirect it, distinct source/window records remain independent, and no zero-argument whole-backend teardown is appropriate. |
| 22 | `AudioDeviceBackend` | Devices, buffers, and sources are returned as keyed handles; each resource family exposes its own matching destroy operation. | **Owned by keyed handles.** Cleanup targets the originating handle rather than a zero-argument whole-backend teardown. |

This table deliberately does not collapse “has a cleanup-named API” into “done.” Geolocation,
notification, protocol, status-bar, and tray cleanup all exist by name yet lack enough provider
provenance to guarantee that cleanup reaches the resource which was created.

## GC-managed, pure, or bounded-call backends

These interfaces do not receive whole-backend hooks in the audited tree. Their implementations do
not retain a freeable external object or unbracketed host mutation beyond the lifetime named here.

| # | Backend | Evidence |
| ---: | --- | --- |
| 1 | `BidiClassBackend` | Pure codepoint-to-class lookup. |
| 2 | `CanvasTextShaperBackend` | Measurement plus a GC cache; `clearCache()` invalidates cached values and is not destruction. |
| 3 | `DeviceBackend` | Snapshot queries fill caller-owned output values. |
| 4 | `GlyphRasterizerBackend` | Per-call rasterization/measurement returns caller-owned data; web scratch canvas state is GC-managed. |
| 5 | `HapticsBackend` | Current web and Capacitor effects are bounded and expose explicit `cancel()`. Web ignores waveform repetition and Capacitor omits waveform. If a future provider honors `repeat >= 0`, that provider acquires a teardown obligation and this row must be reclassified. |
| 6 | `NetBackend` | One-shot request promise bracketed by response consumption and `AbortSignal`; no connection registry. |
| 7 | `PathBooleanBackend` | Pure contour operation over caller-owned arrays. |
| 8 | `PermissionBackend` | One-shot query/request promises returning snapshots. |
| 9 | `PlatformBackend` | Snapshot query into caller-owned output. |
| 10 | `ShareBackend` | One bounded share-sheet promise per call. |
| 11 | `ShellBackend` | Bounded host command promises; no returned live handle. |
| 12 | `StorageBackend` | Synchronous key/value operations. The optional cross-tab listener is package-owned: `disableStorageSignals` invokes the captured unsubscribe, and `setStorageBackend` unsubscribes before rebinding. |
| 13 | `TextSegmenterBackend` | Pure segmentation result; an `Intl.Segmenter` object is ordinary GC-managed state. |
| 14 | `TextShaperBackend` | Per-call measurement/shaping with GC-managed font/cache objects and no external handle contract. |
| 15 | `WebcamBackend` | Bounded picker/capture promises returning data URLs, not a retained camera stream. |

Post-audit row: `AudioBackend` exposes only `canPlayType(mimeType): boolean`; it joins this bucket as
row 16. It has no audio device, decoded buffer, source, stream, or playback ownership.
`AudioDeviceBackend` — anticipated here as a separate contract — has since landed, and is classified
from its actual lifetime shape in the entity/keyed bucket rather than this one, because it does own
resources; they are simply handle-keyed rather than whole-backend.

Post-audit `WgpuHostBackend` and `InputIngressBackend` join the entity/keyed bucket as rows 20–21,
and `AudioDeviceBackend` as row 22. They move the live denominator from 43 to 46 and that bucket from
19 to 22 without changing the whole-owner population. The structural lifecycle census should
therefore report five whole-backend hooks among 46 interfaces.

## Review checklist for the remaining slices

For each of the three missing whole-backend hooks, tests must cover replacement with a different
object, removal with `null`, identical-object reinstall, repeated explicit destruction, and aliasing
between custom and host slots. Assertions must inspect the real external effect—removed listener,
released handle, cleared singleton state—not only a mock call count.

For an entity/keyed row marked owed, tests must create the resource under provider A, replace the
global provider with B, then clean up through the public API and prove that A—not B—received the
resource-specific teardown. That is the smallest test that distinguishes a cleanup-shaped method
from correct ownership provenance.
