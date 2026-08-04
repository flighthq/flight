# layout — Status

## 2026-08-04 — First complete increment

Built `@flighthq/layout` as a types-only, renderer-neutral rectangle resolver. The package now has
flat-tree and numeric-buffer contracts, an open resolver registry, anchor/flex/grid built-ins,
diagnosable sentinel failures, an opt-in guard, bundle-isolation tests, and size fixtures.

The package lane passes 27 tests. Bundle evidence proves that anchor-only use retains neither flex nor
grid; measured production gzip is 0.63 KB anchor-only and 2.56 KB with all built-ins. Viewport is the
N=1 composition case for rectangle alignment, while scale mode remains later binding. Rive/Yoga can
translate into the generic descriptors later without creating an importer dependency now.
