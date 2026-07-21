---
package: '@flighthq/camera-controls'
updated: 2026-07-21
basedOn: ./review.md
---

# camera-controls — Assessment

The charter is not directed yet; this assessment uses the repository AAA/composition standard and
keeps larger controller-family choices out of `Recommended`.

## Directed

1. **Make both controller constructors produce Entities.** Move the controller interfaces onto the
   Entity contract and construct through `createEntity`, preserving the current plain fields and
   input-agnostic behavior.

## Recommended

1. **Correct the package description.** Remove the claim that this package owns 2D follow behavior.
2. **Make orbit pan semantics precise.** Rename/document the existing world-up pan honestly and add a
   separate true view-plane pan only if that distinction can be expressed without changing callers.
3. **Define angular wrap behavior and test the ±π seam.** Use shortest-angle damping or explicitly
   normalize external wrapped deltas into the package's chosen continuous-angle contract.

## Depth gaps

1. **Add controller-state primitives.** Reset, snap current to goal, clone/capture/restore, and direct
   setters prevent callers from manually synchronizing coupled current/goal fields.
2. **Add explicit framing composition.** Fit a sphere/AABB into perspective or orthographic projection
   using the active viewport aspect and padding, then optionally update an orbit target/distance.
3. **Keep advanced behaviors compositional.** Arcball/trackball, additive shake, rails/cinematic paths,
   and a caller-supplied collision query for fly movement should be separate primitives or adapters,
   not branches in a universal controller.

## Backlog

- Input-device mappings belong in small input/application adapters, not this headless package.
- The charter needs a direction session before the advanced-controller family is expanded.

## Approved

None.
