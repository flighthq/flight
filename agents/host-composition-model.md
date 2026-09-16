# Host Composition Model

_2026-09-16. Architecture record — the naming, typing, structure, and decomposition of host capabilities._

**Status: ratified 2026-09-16 by the user.** Read before renaming host types or consts, adding a function that consumes a host capability, creating a new host group or slot, or decomposing a provider.

This record governs the **consumer-facing API surface** — how types, consts, parameters, groups, and slots are named and structured. The extraction mechanics (precedence, enablers, provider transitions, bundle evidence) remain in [host-web architecture](host-web-architecture.md). The explicit dependency model (no ambient state, values not singletons) remains in [explicit dependency model](explicit-dependency-model.md).

---

## 1. Three-Level Structure

The host is a flat container of domain groups. Each group contains independently-coverable capability slots. Each capability is an Entity with methods (hooks).

```
Host (Entity, flat)
  group per domain (struct, non-optional, named by package)
    slot per capability (Entity, optional, independently coverable)
      methods / hooks (non-optional on the Entity, grow over time)
```

Three levels, each with a clear role:

| Level | Role | Optional? | Named by |
|-------|------|-----------|----------|
| Group | Domain organization | No — always present on Host | SDK package |
| Slot | Capability presence | Yes — null means absent | Independently coverable capability |
| Hook | Operation | No — present when the capability is | Verb/action |

The `?.` null check is always at exactly one level — the slot. Groups are non-optional structs. Hooks are non-optional methods on a present capability Entity.

### Slot boundary test

A slot earns its existence when:

> A host can support A without supporting B, or A has materially different semantics, lifetime, or error behavior from B.

The number of hooks per capability is irrelevant. A single-hook capability is valid if it independently varies across platforms. Conversely, many hooks that always come together are one capability.

### Primary subject test

A capability belongs to the group whose primary subject it operates on:

> Window APIs describe operations whose primary subject is a window handle. Input/graphics/surface APIs may affect something visually associated with a window, but their primary subject is their own handle.

---

## 2. Type Naming: `Host*Capability`

Every host capability type uses the `Host{Domain}{Name}Capability` pattern. The word "Capability" describes what the type is to a consumer — a thing the host can or cannot do.

```typescript
interface HostImageLoaderCapability extends Entity { ... }
interface HostWindowFullscreenCapability extends Entity { ... }
interface HostGlyphRasterizerCapability extends Entity { ... }
```

The `Host` prefix identifies the type as a platform capability. The capability name follows. `Capability` is the suffix. No abbreviations.

### Why Capability, not Provider

- **Matches the consumer question.** `hasHostWindowFullscreen` checks for a capability, not an implementation. "Has capability" reads; "has provider" leaks implementation.
- **Matches group naming.** Groups are `Host*Capabilities`. A capabilities struct containing capabilities is natural; containing "providers" mixes abstraction levels.
- **Self-documenting at the call site.** The type tells you: this is something the host may or may not have.

### Capability as Entity

Capabilities extend Entity because Entity enforces consistent V8 hidden-class shape, provides identity for diagnostics, and offers a hook for lowering to a class on native platforms (C/C++ struct with header). In C, a capability is a struct with function pointers and a common header — a small vtable. Entity is the tag that says "Flight allocated this."

Entity also buys method-level extensibility: a capability that starts with one hook can grow optional hooks later without changing the slot structure.

---

## 3. Const Naming: `webHost*` / `electronHost*`

Platform consts follow `{platform}Host{Capability}`. The platform prefix (`web`, `electron`, `tauri`, `capacitor`) identifies provenance. No `Capability` suffix on consts — the type carries it; the const is the value.

### Two tiers

| Tier | Pattern | Example | Type |
|------|---------|---------|------|
| Full host | `{platform}Host` | `webHost` | `Host` (all groups) |
| Leaf | `{platform}Host{Capability}` | `webHostImage`, `webHostNet` | `HostImageLoaderCapability`, `HostNetCapability` |

Group-level consts (`webHostGraphics`, `webHostMedia`) are no longer meaningful — super-groups have dissolved. Leaf consts exist for tree-shaking: importing `webHostImage` pulls only the image capability.

---

## 4. Parameter Naming: `hostImage`, `hostNet`

Functions that consume a host capability name the parameter `host{Capability}`:

```typescript
function loadImageResourceFromUrl(
  hostImage: Readonly<HostImageLoaderCapability>,
  url: string,
): Promise<ImageResource>
```

The host capability is the first parameter when present.

### Rules

- A function needing one capability: parameter is `host{Capability}`.
- A function needing multiple capabilities: one parameter per capability, host capabilities first.
- Parameter type is `Readonly<Host*Capability>`.
- The full `Host` is never a parameter type for a function that uses only one capability. Functions declare their minimum requirement.

---

## 5. Host Groups — Full Inventory

Super-groups (`system`, `graphics`, `media`, `text`, `input`, `ui`) dissolve. Each domain gets its own top-level group, named by its SDK package.

### Groups that stay (already one-domain)

`accessibility`, `clipboard`, `connectivity`, `dialog`, `ipc`, `menu`, `midi`, `notification`, `power`, `protocol`, `screen`, `share`, `shell`, `shortcut`, `tray`, `updater`

### Groups from dissolving `system`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.device` | `system.device` | Device info queries |
| `host.geolocation` | `system.geolocation` | Position tracking |
| `host.permissions` | `system.permissions` | Permission query/request |
| `host.platform` | `system.platform` | Platform info |
| `host.sensors` | `system.sensors` | Sensor availability |

`system.lifecycle` moves to `host.app` (see App merge below).

### Groups from dissolving `graphics`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.bitmap` | `graphics.bitmapEncode`, `graphics.bitmapReadback` | Slots: `encode`, `readback` |
| `host.image` | `graphics.image` | Image loading/creation |
| `host.gl` | `graphics.renderContext` + new GL acquire | GL context lifecycle |
| `host.surface` | `graphics.renderSurface` | Render surface lifecycle |
| `host.wgpu` | `graphics.wgpuHost` | WGPU device/context |

### Groups from dissolving `media`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.audio` | `media.audioCodec`, `media.audioDevice`, `media.audioMixer` | Slots: `codec`, `device`, `mixer` |
| `host.video` | `media.video` | Video decode/present |
| `host.mediaSession` | `media.session`, `media.sessionAction` | Slots: `control`, `action` |

### Groups from dissolving `text`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.font` | `text.fontLoading` | Font loading |
| `host.glyph` | `text.glyphRasterizer` | Glyph rasterization (not atlas) |
| `host.textSegment` | `text.segmenter` | Text segmentation |
| `host.textShaper` | `text.shaper` | Text shaping |

### Groups from dissolving `input`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.input` | `input.ingress`, `input.dropFile`, `input.focus`, `input.pointerLock`, `input.target` | Stays, minus haptics and keyboard |
| `host.haptics` | `input.haptics` | Haptic feedback |
| `host.softKeyboard` | `input.softKeyboard*` (7 slots) | Virtual keyboard. "soft" stays — different from physical keyboard |

### Groups from dissolving `net`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.net` | `net.http` | HTTP networking |
| `host.socket` | `net.socket` | WebSocket/sockets |

### Groups from dissolving `storage`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.preferences` | `storage.local`, `storage.change`, `storage.persistenceQuery`, `storage.persistenceRequest` | Package rename: `storage` → `preferences`. Slots: `local`, `change`, `persistenceQuery`, `persistenceRequest` |
| `host.fileSystem` | `storage.fileSystem` | File system access. Slot: `access` |

### Groups from dissolving `ui`

| New group | Former path | Notes |
|-----------|-------------|-------|
| `host.fullscreen` | `ui.fullscreen` | Element-level fullscreen (`HostElementFullscreenCapability`) |
| `host.statusBar` | `ui.statusBar*` (6 slots) | Drop `statusBar` prefix on slot names |

### New groups

| Group | Purpose |
|-------|---------|
| `host.surface` | Render surface acquire/resize/release — shared substrate for GL and WGPU |
| `host.gl` | GL context acquisition and context loss/restoration events |

### App group after merge

`App`, `Application`, and `AppLifecycle` merge into one entity `App`, one package `@flighthq/app`. The host group absorbs:

- `loop` from application → `HostAppLoopCapability`
- `exit` from application → `HostAppExitCapability` (was `HostApplicationExitProvider`)
- `lifecycle` from system → `HostAppLifecycleCapability`
- `visibility` and `hiddenQuery` dissolve into `AppLifecycleState`

---

## 6. Window Decomposition

`HostWindowProvider` (a 30-method monolith) decomposes into independently-coverable capability slots. The direct-provider exception is eliminated — window becomes a group like everything else.

Evidence: every consumer already narrows with `Required<Pick<HostWindowProvider, 'close'>>` — per-method capability selection expressed through type gymnastics. Decomposition replaces this with structural slots.

### Window capability slots

| Capability | Hooks |
|------------|-------|
| `HostWindowAppearanceCapability` | `setTitle`, `setIcon?`, `setOpacity?` |
| `HostWindowAttachCapability` | `attach` |
| `HostWindowAttentionCapability` | `requestAttention`, `flashWindowFrame?` |
| `HostWindowContentProtectionCapability` | `setContentProtection` |
| `HostWindowFocusCapability` | `focus` |
| `HostWindowFullscreenCapability` | `setFullscreen` |
| `HostWindowGeometryCapability` | `setPosition`, `setSize`, `getBounds`, `center?`, `subscribeMove?`, `subscribeResize?` |
| `HostWindowHierarchyCapability` | `setParent` |
| `HostWindowLifecycleCapability` | `open`, `close`, `subscribeClose?` |
| `HostWindowProgressCapability` | `setProgress` |
| `HostWindowShadowCapability` | `setHasShadow` |
| `HostWindowShellCapability` | `setMenuBarVisible?`, `setSkipTaskbar?` |
| `HostWindowSizeConstraintsCapability` | `setMinimumSize`, `setMaximumSize` |
| `HostWindowStateCapability` | `minimize`, `maximize`, `restore` |
| `HostWindowVisibilityCapability` | `show`, `hide`, `subscribeVisibility?` |
| `HostWindowZOrderCapability` | `setAlwaysOnTop` |

Events pair with their capability (mutations and observation of a concept live together). `subscribeClose` lives with lifecycle, `subscribeMove` and `subscribeResize` with geometry, `subscribeVisibility` with visibility.

`subscribeOrientation` moves to `host.screen` — orientation is a per-screen property, already covered by `HostScreenChangeCapability` with `changedMetrics.orientation`.

### Element vs window fullscreen

Two separate capabilities with different subjects:

| Capability | Subject | Group |
|------------|---------|-------|
| `HostWindowFullscreenCapability` | Window handle | `host.window` |
| `HostElementFullscreenCapability` | Element/target handle | `host.fullscreen` |

They must not converge merely because both contain the word "fullscreen."

---

## 7. Graphics Stack

Three layers, cleanly separated:

```
host.surface    — render surface acquire, resize, release (shared substrate)
host.gl         — GL context acquisition, context loss events
host.wgpu       — WGPU device/context acquisition, surface attachment
```

Surface is the platform-specific thing you render into. GL and WGPU are API-specific context layers on top. A consumer that needs a render target takes `hostSurface`; a consumer that needs a GL context takes both.

GL context "resize" is not a real operation — you change the viewport (`glViewport`) and reallocate framebuffers at the render layer. Surface resize IS a host operation (the surface has dimensions that change).

---

## 8. Provider Type Renames

| Before | After | Reason |
|--------|-------|--------|
| `Host*Provider` (all) | `Host*Capability` | §2 |
| `HostApplicationExitProvider` | `HostAppExitCapability` | App merge |
| `HostApplicationVisibilityProvider` | dissolves | Absorbed into lifecycle state |
| `HostAppVisibilityQueryProvider` | dissolves | Absorbed into lifecycle state |
| `HostLoopProvider` | `HostAppLoopCapability` | Missing domain prefix |
| `HostFullscreenProvider` | `HostElementFullscreenCapability` | Disambiguate from window fullscreen |
| `HostAudioProvider` | `HostAudioCodecCapability` | Slot is `codec`, type should match |
| `HostWindowProvider` | decomposes into ~14 capabilities | §6 |

---

## 9. Naming Conventions for Slots

Slot names are scoped by their group — they do not repeat the group name:

```typescript
host.statusbar.color      // not host.statusbar.statusBarColor
host.softKeyboard.info    // not host.softKeyboard.softKeyboardInfo
host.audio.codec          // not host.audio.audioCodec
```

For single-slot groups, the slot name describes the specific capability:

| Group | Slot | Why |
|-------|------|-----|
| `host.accessibility` | `tree` | Accessibility tree management |
| `host.device` | `info` | Device information queries |
| `host.fileSystem` | `access` | File system access |
| `host.geolocation` | `position` | Position tracking |
| `host.gl` | `context` | GL context lifecycle |
| `host.haptics` | `engine` | Haptic feedback engine |
| `host.image` | `loader` | Image loading/creation |
| `host.lifecycle` | `state` | Lifecycle state tracking |
| `host.permissions` | `query` | Permission query/request |
| `host.platform` | `info` | Platform information |
| `host.sensors` | `query` | Sensor availability queries |
| `host.socket` | `connection` | Socket connection management |
| `host.surface` | `resize` | Surface resize |
| `host.video` | `playback` | Video decode/present |
| `host.wgpu` | `context` | WGPU device/context |

---

## 10. Tree-Shaking Model

Leaf consts are separately importable from the host backend package:

```typescript
import { webHostImage } from '@flighthq/host-web';
loadImageResourceFromUrl(webHostImage, url);

import { webHost } from '@flighthq/host-web';
loadImageResourceFromUrl(webHost.image.loader, url);
```

Importing `webHostImage` pulls only the image capability. The full `webHost` is a convenience assembly.

---

## 11. Package Decisions

| Decision | Detail |
|----------|--------|
| `storage` → `preferences` | Key-value persistence. "Storage" is too generic; "preferences" matches industry naming (Capacitor, Android SharedPreferences, iOS UserDefaults, SDL3 UserStorage). |
| `softKeyboard` stays `softKeyboard` | Virtual keyboard is a different domain from physical keyboard input. |
| `glyph` not `glyphatlas` for host group | The host provides glyph rasterization, not atlas management. The atlas is the SDK construct. |
| `application-gl` dissolves | Render view factory moves to render layer; GL context capability moves to `host.gl`. |
| App/Application/AppLifecycle merge | One entity `App`, one package `@flighthq/app`. |

---

## 12. Has\* Traits

Has\* traits are **not needed** for host capabilities. The node `Has*` pattern (`HasTransform2D`, `HasBoundsRectangle`) describes what kind of node something is via structural composition. Host capabilities are already concrete Entity types with methods — they don't need a wrapper. The census confirms: 98% of capability-consuming functions take a single capability directly. Zero functions take a group type. Zero take the whole Host.
