# tray — Assessment

See [charter](./charter.md) for blessed direction. Re-derived against live source 2026-07-30; the
prior single item was already done in the tree.

## Recommended

1. **Web-backend `isDestroyed` returns true for every id, including ids never created** — honest for
   "no trays exist on web", but it makes `isTrayDestroyed` unable to distinguish "destroyed" from
   "never existed" on any backend that behaves the same way. **Deliberately not taken 2026-07-31**: this
   is the same unknown-key sentinel question the `loader` cell raises, and it wants one ruling across
   the platform suite rather than a tray-local answer. Routed alongside loader's.

## Landed

- ~~**Decide whether `TrayIcon` handles should compare by identity.**~~ Decided and documented
  2026-07-31: compared by `id`, never by identity, stated on the type with the reasoning for *not*
  interning — the id is the whole of the identity, a registry would need invalidating on every destroy,
  and a plain-data handle stays serializable and portable where an interned one does not. A test pins
  both the failing `includes` form and the working `id` comparison, so it shows the remedy rather than
  only the trap.
- ~~**Guard `startTrayIconAnimation` against a non-positive interval.**~~ Landed 2026-07-31 as
  `enableTrayGuards`, through a `setTrayAnimationGuard` seam so the message and the `@flighthq/log`
  dependency stay out of the package's hot path. It warns rather than throwing or refusing, per the
  diagnostics-inversion answer the item itself specified: a zero interval schedules as fast as the host
  runs timers, so the animation *appears* to work while burning a core, and nothing points at the call
  that asked for it.

## Approved

1. **Fix `getTrayIconBounds` return type to use `RectangleLike`** [2026-07-02 · blanket "platform
   integration suite sweep"] — done.

## Backlog

- **Multi-tray support** — charter Open direction 2. The API already carries per-icon ids throughout
  and the animation registry is keyed by id, so the implementation is multi-tray; what is undecided
  is whether that is the blessed contract or an accident to be narrowed.
- **Web-backend fidelity** — charter Open direction 1, unchanged.
