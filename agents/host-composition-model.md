# Host Composition Model

_2026-09-11. Architecture record — the naming, typing, and composition surface for host capabilities._

**Status: ratified 2026-09-11 by the user.** Read before renaming host types or consts, adding a function that consumes a host capability, or creating a new host leaf/group const.

This record governs the **consumer-facing API surface** — how types, consts, parameters, and imports are named and structured. The extraction mechanics (precedence, enablers, provider transitions, bundle evidence) remain in [host-web architecture](host-web-architecture.md). The explicit dependency model (no ambient state, values not singletons) remains in [explicit dependency model](explicit-dependency-model.md).

---

## 1. Type Naming: `Host*Provider`

Every host capability type uses the `Host*Provider` pattern. The word "Provider" replaces "Backend" in the user-facing API — "backend" is an implementation detail, "provider" describes what the type is to a consumer.

```typescript
interface HostImageProvider extends Entity { ... }
interface HostNetProvider extends Entity { ... }
interface HostStorageProvider extends Entity { ... }
interface HostGraphicsProvider extends Entity { ... }   // group type
```

The `Host` prefix identifies the type as a platform capability. The capability name follows. `Provider` is the suffix. No abbreviations.

### Rename from current naming

| Before | After |
|--------|-------|
| `ImageBackend` | `HostImageProvider` |
| `NetBackend` | `HostNetProvider` |
| `ClipboardBackend` | `HostClipboardProvider` |
| `HasGraphicsImage` | `HostImageProvider` |
| `HasNetHttp` | `HostNetProvider` |

The `Has*` trait interfaces collapse into the `Host*Provider` types. A function that needs the image capability takes `HostImageProvider` directly — no nested-path trait required.

---

## 2. Const Naming: `webHost*` / `electronHost*`

Platform consts follow `{platform}Host{Capability}`. The platform prefix (`web`, `electron`, `tauri`, `capacitor`) identifies provenance. No `Provider` suffix on consts — the type carries it; the const is the value.

### Three tiers

| Tier | Pattern | Example | Type |
|------|---------|---------|------|
| Full host | `{platform}Host` | `webHost` | `Host` (all groups) |
| Group | `{platform}Host{Group}` | `webHostGraphics` | `HostGraphicsProvider` |
| Leaf | `{platform}Host{Capability}` | `webHostImage`, `webHostNet` | `HostImageProvider`, `HostNetProvider` |

All three tiers are separately importable from the host package. Leaf consts exist for tree-shaking: importing `webHostImage` pulls only the image provider, not the full `webHost` assembly.

### Rename from current naming

| Before | After |
|--------|-------|
| `webImageBackend` | `webHostImage` |
| `webNetBackend` | `webHostNet` |
| `webBitmapEncodeBackend` | `webHostBitmapEncode` |
| `webGraphicsHost` | `webHostGraphics` |

---

## 3. Host Structure: Grouped

The `Host` entity keeps its grouped structure. Capabilities are accessed through their group:

```typescript
webHost.graphics.image      // HostImageProvider
webHost.graphics.surface    // HostSurfaceProvider
webHost.net.http            // HostNetProvider
webHost.media.session       // HostMediaSessionProvider
```

This mirrors the `Host` interface's 26 top-level groups. Groups organize capabilities by domain; the grouping is stable and does not change with the composition model.

---

## 4. Parameter Naming: `hostImage`, `hostNet`

Functions that consume a host capability name the parameter `host{Capability}`:

```typescript
// Single capability — parameter named after what it provides
function loadImageResourceFromUrl(
  hostImage: Readonly<HostImageProvider>,
  url: string,
): Promise<ImageResource>

// Multiple capabilities — one parameter per provider
function fetchAndDecodeImage(
  hostNet: Readonly<HostNetProvider>,
  hostImage: Readonly<HostImageProvider>,
  url: string,
): Promise<ImageResource>
```

The parameter name mirrors the const name (`webHostImage` passed as `hostImage`). This makes the call site self-documenting:

```typescript
import { webHostImage, webHostNet } from '@flighthq/host-web';

loadImageResourceFromUrl(webHostImage, url);
fetchAndDecodeImage(webHostNet, webHostImage, url);
```

### Rules

- A function needing one capability: parameter is `host{Capability}` (e.g., `hostImage`).
- A function needing multiple capabilities: one parameter per capability (e.g., `hostNet`, `hostImage`), not a merged object.
- Parameter type is `Readonly<Host*Provider>`, consistent with the SDK's `Readonly<T>` convention.
- The full `Host` is never a parameter type for a function that uses only one capability. Functions declare their minimum requirement.

---

## 5. Tree-Shaking Model

The three-tier const export (full / group / leaf) serves tree-shaking directly:

```typescript
// Minimal — only image provider in the bundle
import { webHostImage } from '@flighthq/host-web';
loadImageResourceFromUrl(webHostImage, url);

// Group — all graphics providers
import { webHostGraphics } from '@flighthq/host-web';
loadImageResourceFromUrl(webHostGraphics.image, url);

// Full — everything
import { webHost } from '@flighthq/host-web';
loadImageResourceFromUrl(webHost.graphics.image, url);
```

The leaf const is a separately importable value, not a property accessor on the full host. Importing `webHostImage` does not pull `webHostNet` or any other provider. The full `webHost` is a convenience assembly — every leaf it composes is also available standalone.

---

## 6. Summary

| Surface | Pattern | Example |
|---------|---------|---------|
| Type | `Host{Capability}Provider` | `HostImageProvider` |
| Full host const | `{platform}Host` | `webHost` |
| Group const | `{platform}Host{Group}` | `webHostGraphics` |
| Leaf const | `{platform}Host{Capability}` | `webHostImage` |
| Parameter | `host{Capability}` | `hostImage` |
| Import path | `@flighthq/host-{platform}` | `@flighthq/host-web` |
