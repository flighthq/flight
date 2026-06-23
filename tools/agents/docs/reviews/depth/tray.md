# Depth Review: @flighthq/tray

**Domain**: System tray / menu-bar icon — a persistent OS notification-area icon with an icon image, tooltip/title, a context menu, and click events (Electron `Tray`, Tauri `TrayIcon`, NW.js `Tray` are the reference libraries).

**Verdict**: partial — completeness **48/100**

The package is a clean, correctly-shaped backend seam over the canonical tray operations, but it covers only the lowest common denominator of what a mature tray library exposes. It is more than a stub (icon lifecycle, tooltip, title, context menu, and the three primary click events are all present and tested), but it is well short of an authoritative tray library: it is missing icon image updates, pressed/template icons, balloon notifications, menu-bar-specific affordances, and rich event payloads (modifier keys, click position/bounds).

## Present capabilities

- `createTrayIcon(options?)` — creates an icon from `{ icon, tooltip, title }`, returning `null` on hosts with no tray (web). Correct sentinel translation (backend `-1` → `null`).
- `destroyTrayIcon(tray)` — frees the host resource. (Correct verb: `destroy*` because it frees a non-GC native handle.)
- `setTrayIconTooltip(tray, tooltip)` — hover tooltip.
- `setTrayIconTitle(tray, title)` — title text (the macOS menu-bar text label).
- `setTrayContextMenu(tray, items)` — attaches a `MenuItemTemplate[]` context menu (delegated to `@flighthq/menu` types).
- `onTrayEvent(listener)` — subscribes to `click` / `rightClick` / `doubleClick`, delivering `(id, event)`; returns an unsubscribe function.
- `getTrayBackend` / `setTrayBackend` / `createWebTrayBackend` — the standard command-capability backend seam (lazy web default, native override). Matches the platform-suite pattern exactly.

The exported surface, comments, and tests are clean and idiomatic. The web no-op/sentinel backend is correct and well-documented.

## Gaps vs an authoritative tray library

Missing-by-omission (a mature tray library is expected to provide these):

- **Icon image update.** There is no `setTrayIcon(tray, icon)`. The icon can be set only at creation; you cannot change it at runtime (status indicators, animated/blinking trays, theme changes). This is the single most surprising omission — Electron and Tauri both expose `setImage`.
- **Pressed / template / theme-aware icon.** No `setTrayPressedIcon` (Electron `setPressedImage`) and no notion of a macOS _template image_ (auto-inverting for light/dark menu bars). Without this, macOS dark-mode menu bars render wrong.
- **Balloon / tray notifications.** No `displayTrayBalloon` (Electron `displayBalloon` / `removeBalloon`, with title/content/icon and balloon `show`/`click`/`close` events). This is a core Windows tray feature.
- **Programmatic menu popup.** No `popupTrayContextMenu(tray, position?)` to show the menu on demand (Electron `popUpContextMenu`) — only passive attachment.
- **Rich event payloads.** Events carry only `(id, type)`. An authoritative library reports click **bounds/position** (for positioning a popover) and **modifier keys** (`shift`/`ctrl`/`alt`/`meta`), plus platform events: `mouse-enter`/`mouse-leave`/`mouse-move`, `mouse-up`/`mouse-down`, `drop`/`drop-files`/`drop-text`, and `middleClick`. None are present.
- **Icon geometry query.** No `getTrayIconBounds(tray)` (Electron `getBounds`) — needed to anchor a window/popover to the tray icon.
- **State queries / additional setters.** No `isTrayDestroyed`, no `setTrayIgnoreDoubleClickEvents` (Electron, macOS), no per-icon `getTitle`/`getTooltip` getters.

Missing-by-design (correctly excluded — not a gap):

- **Application / dock badge** — explicitly delegated to `@flighthq/app` `setAppBadgeCount` (documented in source and the package map). Correct boundary.
- **Menu item modeling** — delegated to `@flighthq/menu`'s `MenuItemTemplate`. Correct reuse.
- **Web implementation of the tray itself** — there is no system tray on the web; the web backend's no-ops are correct, not a gap.

## Naming / API-shape notes

- Naming is consistent and self-identifying: `setTrayIconTooltip`, `setTrayIconTitle`, `createTrayIcon`. Good. One asymmetry: the icon-scoped setters are `setTrayIcon*` (`setTrayIconTooltip`, `setTrayIconTitle`) but the menu setter is `setTrayContextMenu` (no `Icon`). Given there is one tray entity per icon, this is defensible, but the inconsistency is visible. If `setTrayIcon(tray, icon)` is added, the `Tray` vs `TrayIcon` prefix split needs a deliberate convention.
- The entity is the minimal `{ id: number }` handle, with state living on the backend keyed by id — consistent with the platform suite's command-capability shape and tree-shakable. Good.
- `onTrayEvent` is a single global subscription keyed by tray `id` inside the listener, rather than per-`TrayIcon` signals. This matches the inbound-host-event seam described in the package map (`on*(listener) => () => void`), so it is the intended shape — but it means consumers filter by id manually. Acceptable for the command-capability style.
- The `TrayBackend` interface in `@flighthq/types` is the design surface and is correctly the place new operations (`setIcon`, `getBounds`, `displayBalloon`, `popUpContextMenu`) would be added first.

## Recommendation

Treat this as a partial implementation to bring up to AAA, not a finished cell. Highest-value additions, roughly in order:

1. `setTrayIcon(tray, icon)` — runtime icon updates. This is the most glaring omission for a tray library.
2. macOS template-image support (an `iconTemplate?: boolean` on `TrayIconOptions` / a `setTrayIconTemplate`) so dark-mode menu bars render correctly.
3. Richer event payload — replace the `(id, event)` callback with an event object carrying `bounds`, modifier flags, and add `middleClick` / `mouse-enter` / `mouse-leave`; extend `TrayEventType` accordingly.
4. `getTrayIconBounds(tray)` for popover anchoring, and `popupTrayContextMenu(tray, position?)` for programmatic menus.
5. Windows balloon API (`displayTrayBalloon` / `removeTrayBalloon` + balloon events) if Windows is a target.
6. `isTrayDestroyed` and `setTrayIgnoreDoubleClickEvents`.

Each is an additive change to `TrayBackend` in `@flighthq/types` plus a delegating free function and a web no-op — no restructuring required. The seam is right; the surface is thin.
