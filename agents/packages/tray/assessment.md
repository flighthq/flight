# tray — Assessment

See [charter](./charter.md) for blessed direction. Re-derived against live source 2026-07-30; the
prior single item was already done in the tree.

## Recommended

1. **Decide whether `TrayIcon` handles should compare by identity** — `createTrayIcon` and
   `getTrayIcons` each mint fresh `{ id }` objects, so a handle from the list is never `===` a handle
   the caller created. Every function keys off `.id`, so nothing is broken, but a caller reasonably
   expects `getTrayIcons().includes(myTray)` to work and it silently does not. Either intern handles
   per id, or say plainly in the type doc that `TrayIcon` is compared by `id`.
2. **Guard `startTrayIconAnimation` against a non-positive interval** — `intervalMs <= 0` becomes a
   `setInterval` firing as fast as the host will schedule it, writing the icon every tick. The
   diagnostics-inversion answer is a guard module rather than a thrown error, since this is caller
   misuse rather than an expected failure.
3. **Web-backend `isDestroyed` returns true for every id, including ids never created** — honest for
   "no trays exist on web", but it makes `isTrayDestroyed` unable to distinguish "destroyed" from
   "never existed" on any backend that behaves the same way. Related to the unknown-key sentinel
   question the `loader` cell raises; probably wants one answer across the suite.

## Approved

1. **Fix `getTrayIconBounds` return type to use `RectangleLike`** [2026-07-02 · blanket "platform
   integration suite sweep"] — done.

## Backlog

- **Multi-tray support** — charter Open direction 2. The API already carries per-icon ids throughout
  and the animation registry is keyed by id, so the implementation is multi-tray; what is undecided
  is whether that is the blessed contract or an accident to be narrowed.
- **Web-backend fidelity** — charter Open direction 1, unchanged.
