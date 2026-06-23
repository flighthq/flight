# Maturation Roadmap: @flighthq/tray

**Current verdict**: partial — completeness 48/100. A correctly-shaped backend seam over the lowest-common-denominator tray operations (icon lifecycle, tooltip, title, context menu, three click events), well short of an authoritative tray library.

The seam is right and the surface is purely additive: every gap below is a new method on `TrayBackend` in `@flighthq/types`, a delegating free function in `@flighthq/tray`, a web no-op/sentinel, and a Rust mirror in `flighthq-tray`. No restructuring is required. Define each new type/field in `@flighthq/types/src/Tray.ts` first, then implement against it.

## Bronze

The 20% that removes the most surprising omissions. After Bronze, a runtime status-indicator tray (the canonical use case) is fully expressible.

- **`setTrayIcon(tray, icon)`** — runtime icon swap (Electron `setImage`, Tauri `set_icon`). The single most glaring omission: today the icon is fixed at creation, so status/animated/theme-change indicators are impossible. Adds `setIcon(id, icon)` to `TrayBackend`.
- **`setTrayIconTemplate(tray, isTemplate)`** plus **`iconTemplate?: boolean`** on `TrayIconOptions` — macOS template-image flag (auto-inverting for light/dark menu bars). Without it, dark-mode menu bars render wrong. Adds `setTemplate(id, isTemplate)` to `TrayBackend`.
- **`popupTrayContextMenu(tray, position?)`** — show the attached context menu on demand (Electron `popUpContextMenu`), not only passive attachment. `position?: Readonly<PointLike>` (reuse a `{ x, y }` `*Like`, not a new type). Adds `popUpContextMenu(id, position?)`.
- **`isTrayDestroyed(tray): boolean`** — guard against use-after-destroy. Adds `isDestroyed(id): boolean`; web returns `true`.
- **Resolve the `Tray` vs `TrayIcon` prefix asymmetry now** (design decision, see Sequencing). `setTrayContextMenu`/`setTrayIcon` are tray-scoped; `setTrayIconTooltip`/`setTrayIconTitle` are icon-property-scoped. Lock the convention before more setters land so the surface stays self-consistent.

## Silver

Competitive with Electron/Tauri/NW.js for professional desktop use: rich events, geometry anchoring, and the Windows balloon path.

- **Rich event payload** — replace the `(id, event: TrayEventType)` callback with a `TrayEventData` object. New type in `@flighthq/types`:
  - `type: TrayEventType`, `id: number`
  - `bounds: Readonly<Rectangle>` — icon bounds for popover/window anchoring (Electron passes `bounds` on click).
  - `position: Readonly<Point>` — pointer position.
  - modifier flags `shiftKey` / `ctrlKey` / `altKey` / `metaKey` (mirror `PointerEventData`'s field names for cross-package consistency).
  - `subscribe` becomes `subscribe(listener: (event: Readonly<TrayEventData>) => void)`; `onTrayEvent` re-typed accordingly. This is the one non-additive change in the roadmap — do it as a deliberate pre-release break, not a parallel callback.
- **Extend `TrayEventType`** — add `'middleClick'`, `'mouseEnter'`, `'mouseLeave'`, `'mouseMove'`, `'mouseUp'`, `'mouseDown'`, `'dragEnter'`, `'dragLeave'`, `'drop'`, `'dropFiles'`, `'dropText'` (Electron's full tray event set). Drop payloads carry `files: readonly string[]` / `text: string` on `TrayEventData`.
- **`getTrayIconBounds(tray): Rectangle | null`** — explicit query for anchoring (Electron `getBounds`); allocate via `createRectangle`/out-param convention, `null` on web. Adds `getBounds(id): Rectangle | null`.
- **`setTrayPressedIcon(tray, icon)`** — macOS pressed/highlight icon (Electron `setPressedImage`). Adds `setPressedIcon(id, icon)`.
- **Windows balloon API** — `displayTrayBalloon(tray, options)` / `removeTrayBalloon(tray)` with `TrayBalloonOptions { title, content, icon?, iconType?, largeIcon?, noSound?, respectQuietTime? }` (Electron `displayBalloon`). Balloon lifecycle events (`balloonShow`/`balloonClick`/`balloonClose`) fold into `TrayEventType` + `TrayEventData`. Adds `displayBalloon(id, options)` / `removeBalloon(id)`.
- **`setTrayIgnoreDoubleClickEvents(tray, ignore)`** — macOS, collapse double-click into two clicks (Electron). Adds `setIgnoreDoubleClickEvents(id, ignore)`.
- **Getters** — `getTrayIconTitle(tray): string`, `getTrayIconTooltip(tray): string` for round-tripping state. Adds `getTitle`/`getTooltip` to `TrayBackend`; web returns `''`.
- **`@flighthq/host-electron` realization** — implement every new `TrayBackend` method in `createElectronTrayBackend`, typed against the local `ElectronApi`. The seam is meaningless without one concrete native backend exercising it end-to-end.

## Gold

Authoritative reference: exhaustive coverage, every platform affordance, full edge-case handling, conformance tests, and 1:1 Rust parity.

- **Animated icon helper** — `setTrayIconFrames(tray, frames, intervalMs)` / `stopTrayIconAnimation(tray)` as a thin convenience over timed `setTrayIcon`, or document the idiom explicitly. Common enough (sync/loading spinners in the tray) to be canonical, but must stay tree-shakable and side-effect-free (caller owns the timer; no module-level interval).
- **Theme-aware icon set** — `TrayIconOptions.iconLight` / `iconDelegate` so a single tray can carry light/dark variants resolved by the host, beyond the binary template flag. Pairs with `@flighthq/platform` theme/appearance signals.
- **Multiple-icon discipline & limits** — document and test platform caps (Linux/AppIndicator quirks: no click events, menu-only; macOS title vs icon interaction). Encode capability queries: `getTrayCapabilities(): Readonly<TrayCapabilities>` (`{ clickEvents, balloon, title, pressedIcon, bounds, dropFiles }`) so callers degrade gracefully rather than silently no-op. This is the honest answer to "tray behavior is wildly platform-divergent."
- **`getTrayIcons(): readonly TrayIcon[]`** — enumerate live trays (host-process bookkeeping), and ensure `destroyTrayIcon` is idempotent and double-destroy-safe.
- **Full event coverage** — Linux/GTK drag-and-drop edge cases, `mouseMove` throttling guidance, scroll/wheel events where the OS exposes them.
- **Error/edge handling audit** — sentinels for every expected-failure path (no-tray host, destroyed id, unsupported op per-platform), `panic`/throw only on genuine misuse; verify `out`-param/`get*` functions are alias-safe and allocation is explicit.
- **Conformance & visual coverage** — assertion-ported unit tests for every function (`exports:check` clean), a fake-backend test harness exercising the full event payload, and a manual/host-integration smoke for at least Electron. A real tray cannot be jsdom-tested, so the gate is the fake-backend conformance suite plus the host-electron adapter test.
- **Documentation** — per-function docs covering platform divergence (which events fire where, template-image semantics, balloon being Windows-only), the `Tray` vs `TrayIcon` naming convention rationale, and the anchoring recipe (`getTrayIconBounds` → position a `@flighthq/application` window/popover).
- **1:1 Rust parity** — `flighthq-tray` mirrors the final surface: `set_tray_icon`, `set_tray_icon_template`, `popup_tray_context_menu`, `is_tray_destroyed`, `get_tray_icon_bounds`, `display_tray_balloon`, `TrayEventData` (snake_case fields, `Readonly<Rectangle>` → `&Rectangle`), `TrayBackend` trait + `set_tray_backend`, native default backend gated behind the `native` feature, web fill in `host-web`. Record any intentional TS↔Rust divergence (e.g. balloon being a Windows-only no-op elsewhere) in the conformance divergence map. The crate already exists (`crates/flighthq-tray`), so this is extension, not greenfield.

## Sequencing & effort

Recommended order, with dependencies and decisions to surface:

1. **Design decision first (blocking, cheap): the `Tray` vs `TrayIcon` naming convention.** Decide whether tray-scoped mutators are `setTray*` or `setTrayIcon*` before adding `setTrayIcon`/`setTrayPressedIcon`/`setTrayIconTemplate`. This shapes every Bronze/Silver name and a late change is a wide rename. Surface to the user — it is an API-shape decision, not an implementation detail.
2. **Bronze (small, self-contained, low risk).** `setTrayIcon` + template + `popupTrayContextMenu` + `isTrayDestroyed`. Each is one `TrayBackend` method + free function + web no-op + test. No cross-package dependency beyond `@flighthq/types`. ~half a day each including Rust mirror.
3. **Silver event reshape (medium, the one breaking change).** Introduce `TrayEventData` and re-type `subscribe`/`onTrayEvent`. Do this as a single deliberate change while pre-release — do not ship a parallel old+new callback. Depends on `Rectangle`/a `Point` `*Like` already in `@flighthq/types` (present). Mirror the `PointerEventData` modifier-field names for consistency. ~1 day plus test churn.
4. **Silver geometry + balloon + macOS setters (medium).** `getTrayIconBounds`, `setTrayPressedIcon`, balloon API, `setTrayIgnoreDoubleClickEvents`, getters. Balloon needs a new `TrayBalloonOptions` type; check whether it should share fields with `@flighthq/notification`'s options (cross-package design check — likely keep separate, balloons are a tray-specific Win32 concept, but surface the question).
5. **host-electron realization (gating).** Land alongside Silver, not after — an unexercised seam drifts. Cross-package: requires touching `@flighthq/host-electron` (out of the tray worktree's primary domain), so surface it as a coordinated change rather than doing it autonomously.
6. **Gold (large, ongoing).** Capability queries, theme-aware/animated helpers, full platform-divergence docs and tests, Rust conformance. The genuine frontier here is honest cross-platform capability modeling (`getTrayCapabilities`) — tray behavior diverges more by OS than almost any other platform capability, and an authoritative library's value is largely in surfacing that rather than papering over it.

Cross-package / cross-worktree items to surface to the user before acting:

- The `Tray`/`TrayIcon` naming convention (decision, step 1).
- The event-payload breaking change (acceptable pre-release, but a deliberate reshape worth confirming).
- `@flighthq/host-electron` changes (different package domain).
- Whether `TrayBalloonOptions` shares any contract with `@flighthq/notification`.
- All new types land in `@flighthq/types/src/Tray.ts` first (header-layer rule), then `@flighthq/tray`, then `flighthq-tray`.
