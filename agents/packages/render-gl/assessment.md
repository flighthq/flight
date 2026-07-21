---
package: '@flighthq/render-gl'
updated: 2026-07-21
basedOn: ./review.md
---

# render-gl — Assessment

## Directed

1. **Add a real partial-target GL pass.** Viewport and scissor constrain drawing and color/depth clears
   to a sub-rectangle of an existing framebuffer without allocating a replacement target; nested passes
   restore prior viewport and scissor.
2. **Keep GL runtime noise state-owned and private.** Current bindings, caches, scratch, lazy programs,
   and backend registries may hang from the RenderState runtime, but they are implementation facts rather
   than public semantic state.
3. **Prove viewport behavior with raster functionals.** Include sub-rectangle color/depth preservation,
   nested restoration, two viewports on one target, and one camera rendered with two aspects.
4. **Do not create an upward application dependency.** GL provides backend primitives for
   ApplicationRenderView while remaining below application in the package graph.

## Recommended

1. **Make render-target pool matching preserve every storage axis.** Include attachment count, each
   color format, and depth mode; otherwise a released plain target can satisfy an incompatible MRT or
   sampled-depth request.
2. **Preserve heterogeneous MRT formats across resize.** Resize now preserves depth and attachment
   count and deletes the old resolve framebuffer, but GlRenderTarget does not retain per-attachment
   formats, so reallocation falls back to the primary format.
3. **Close fullscreen-present resource ownership.** The copy and linear-to-sRGB program WeakMaps and
   fullscreen VAO WeakMap are not reachable from destroyGlRenderState. Add explicit internal teardown
   hooks and tests for their programs/VAOs.

## Depth gaps

1. **Define the HDR display-output contract.** A linear rgba16f target currently receives only the sRGB
   transfer function on present. Values above display white are encoded then clamped by the canvas; the
   no-effects path therefore has no exposure/tone-map/display transform. Make tone-map choice explicit
   in the presentation assembly while keeping the transfer pass bedrock and subject-agnostic.
2. **Grow color-space metadata beyond linear/sRGB when required.** Working primaries, display primaries,
   transfer, white point, and gamut mapping should be explicit descriptors/passes rather than hidden
   assumptions in textures or present.
3. **Complete the device tier only as consumed primitives.** Capabilities/extensions, context loss and
   recreation, cached depth/cull/color-mask setters, samplers, compressed upload, timer queries, and
   statistics remain gaps; avoid a monolithic device wrapper or eager feature registration.
4. **Make all state-owned GPU caches deterministically destructible.** WeakMap ownership is acceptable
   for lookup, but RenderState destruction must reach every program, VAO, framebuffer, buffer, sampler,
   and state-owned texture it creates.

## Backlog

- Non-separable blend modes remain shader effects, not fixed-function registrations.
- General context recreation needs a cross-package resource-recreation contract.
- Rust parity follows the settled GL contract.

## Approved

None.
