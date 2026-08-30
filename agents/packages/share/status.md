---
package: '@flighthq/share'
updated: 2026-08-29
by: builder5
---

# share — Status

## Open

- **Outcome consistency.** Web distinguishes `AbortError` dismissal from other platform failures;
  Capacitor maps a rejected native command to dismissal. A stronger portable classification would
  require provider evidence the native plugin does not currently expose.
- **Convenience/result symmetry.** `shareText`, `shareUrl`, and `shareFiles` retain their boolean
  convenience results. The detailed content entry point remains the single core signal-emitting path.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-29** — Promoted Share to explicit top-level `Host.share.content` / `Host.share.files`
  slots, removed ambient provider resolution, moved DOM realization to host-web, removed Capacitor's
  async availability cache, and made providers plus core result signals Entities. Explicit slots make
  portable files Web-only, content dual-host, and chooser titles explicitly Capacitor.
- **2026-08-08** — Re-checked the content, file, result, and signal surfaces against shipped providers.
- **2026-07-30** — Live-tree closure audit confirmed the portable file and result types.
- **2026-06-25** — Corrected the DOM-file conversion helper casing.
- **2026-06-24** — Added portable file descriptors, detailed results, core completion signals, and
  Web data-URL conversion.
