---
package: '@flighthq/camera-controls'
updated: 2026-07-21
basedOn: ./review.md
---

# camera-controls — Assessment

The package now has a solid primitive floor. The charter remains undirected, so larger controller
families stay out of automatic work.

## Directed

None. Orbit and fly controller interfaces now extend Entity and both constructors use `createEntity`.

## Recommended

None. The description accurately names both the exported 2D follow primitive and 3D controllers;
world-up and true view-plane orbit pan are separate operations; angular damping takes the shortest
arc across ±π with seam tests.

## Depth gaps

None at the bedrock tier. Controller copy/clone/reset/snap operations preserve runtime ownership and
do not alias mutable vectors. Sphere framing composes target placement with perspective goal distance
or orthographic extents using an explicit active viewport aspect and padding; clip-plane policy stays
visible to the caller.

## Backlog

- Arcball/trackball, additive shake, rails/cinematic paths, and collision-aware fly movement remain
  separate future primitives or adapters. Do not add them as modes on a universal controller.
- Input-device mappings belong in small input/application adapters, not this headless package.
- The charter needs a direction session before the advanced-controller family is expanded.

## Approved

None.
