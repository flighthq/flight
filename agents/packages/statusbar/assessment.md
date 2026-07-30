# statusbar — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. **Parse the short `#rgb` theme-color form** — `_webReadThemeColor` accepts only `#rrggbb`, so a
   page that authored `<meta name="theme-color" content="#fff">` itself reads back as `0`, and the
   baseline captured on the first `pushStatusBarStyleEntry` is wrong for that page. Named colors and
   `rgb()` are the same class; `#rgb` is the common one and the cheap one.
2. **Decide whether `StatusBarInfo.height` should be reported by the web backend at all** — it is
   hardcoded to `-1` (unknown), which is honest, but `visualViewport` / `env(safe-area-inset-top)`
   can approximate it on mobile web. This overlaps the `@flighthq/device` boundary the charter draws,
   so it is a boundary question rather than a missing feature.

## Approved

1. **Make `enableStatusBarSignals` actually gate signal cost** [2026-07-02 · blanket "platform
   integration suite sweep"] — done, by the charter's second branch: the function is gone and the
   package uses the suite's event-capability shape (`createStatusBar` / `attachStatusBar` /
   `detachStatusBar` / `disposeStatusBar`), where cost is assumed at attach.

## Backlog

None.
