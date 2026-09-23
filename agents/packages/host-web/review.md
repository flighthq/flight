---
package: '@flighthq/host-web'
status: solid
score: 86
updated: 2026-09-23
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - package.json
  - ../../host-web-architecture.md
  - ../platform-integration.md
---

# host-web — Review

## Verdict

`solid — 86/100`. `host-web` is an explicit, inspectable browser capability assembly rather than an
ambient platform singleton. Its broad provider set is split by capability, context-sensitive factories
use dependency injection, unsupported groups stay structurally empty, and the aggregate is composed
through the shared `createHost` mechanism. This is the package's first recorded review.

The package's main risk is boundary maintenance rather than a known implementation defect. It has 110
implementation modules across many browser APIs, and every new slot must continue to distinguish
browser availability, execution context, and portable SDK fallbacks without advertising sentinel
support.

## Current architecture

- `webHost` composes named groups for windowing, surfaces, canvas, GL/WGPU, input, files, networking,
  media, device services, lifecycle, and other browser capabilities. The composition test checks every
  group name and identity against the shared Host shape.
- Browser profiles that genuinely differ remain explicit. Page and Service Worker notification
  factories are separate; Window and Worker storage-persistence factories expose different operations;
  MIDI access is injected and is not requested during ordinary host construction.
- Unsupported or deliberately external groups are honest empty capability objects, including global
  shortcuts, IPC, tray, updater, text segmentation, compression, and decompression. Absence remains
  observable without fake providers or global installation.
- `webHostCanvas` now implements `HostCanvasCapability` directly. It acquires a 2D context for a
  Surface, creates window drawables and offscreen `CanvasSurface` values, releases contexts without
  pretending to own DOM lifetime, and destroys owned surfaces by clearing their storage.
- Surface allocation, presentation, resize, and browser-handle access remain separate modules. This
  keeps a window/surface host from implicitly owning every optional rendering library.
- The package declares its web environment and no Rust crate, matching its direct browser-API role.
  It has 65 tests across 110 non-barrel implementation modules; many unpaired files are small capability
  aggregates covered through their group or `webHost` composition tests rather than isolated units.

## Gaps and risks

- The default web aggregate intentionally does not provide portable algorithms such as compression,
  decompression, or text segmentation. A user who wants a turnkey SDK experience must compose the
  portable capability provider elsewhere; `webHost` alone is not that policy bundle.
- Notification and MIDI remain absent from the default aggregate because their correct browser context
  or permission behavior cannot be inferred safely at construction. Callers must select and compose the
  appropriate explicit factory.
- Browser API availability varies by page, worker, permissions, secure context, and user agent. The
  package must keep availability checks and injected factories local to each capability rather than
  treating the `web` environment marker as proof that every slot works.
- The charter links an assessment that does not exist. No assessment was invented during this review;
  there is no user-approved recommendation history to reconstruct.

## Charter fit

The aggregate follows the charter's core rule: capability structure truthfully describes what the
browser host supplies, and unsupported operations remain absent. Empty top-level group objects are part
of the shared Host shape, not sentinel implementations. The package also respects the stated boundary
against simulating native-only facilities.

The charter is much narrower than the present implementation surface, but its principles still cover
the design. The next direction pass may want to state whether `webHost` is only the browser-owned layer
or may also compose portable SDK capabilities; the current implementation consistently chooses the
former.

## Export review

The removed `createWebCanvasRenderSurfaceCreator` and `createWebImageSurfaceCreator` exports belonged
to the retired creator-callback seam. `webHostCanvas` now owns the direct `HostCanvasCapability`
implementation, so neither compatibility creator remains necessary. The refreshed snapshot removes
only those reviewed exports.
