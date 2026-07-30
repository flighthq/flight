---
package: '@flighthq/clipboard'
updated: 2026-07-30
basedOn: ./review.md
---

# clipboard — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

No open sweep-safe items. The approved `ClipboardFormat` cleanup already landed in the implementation
and tests. The live audit also tightened the web change-event capability probe, added its regression,
and brought the Package Map description up to the shipped surface.

## Approved

1. **[2026-07-30 · completed] Fix `ClipboardFormat` constant usage.** Package source migrated in
   `e115beddd`; test fixtures migrated in `3240ad45e`. The live implementation has no hardcoded
   named-flavor MIME literals.

## Backlog

- Mock successful web Clipboard API reads/writes, including multi-flavor items, images, format
  de-duplication, and rejection sentinels after API discovery.
- Decide whether images remain data-URL conveniences or gain a typed bitmap/binary path.
- Decide whether secondary pasteboards, binary custom flavors, lazy rendering, and capability
  introspection belong in the seam.
- Prove native bookmark/file format mapping and truly atomic multi-flavor writes in host-adapter suites.
