---
package: '@flighthq/render-gl'
status: solid
score: 74
updated: 2026-07-21
ingested:
  - charter.md
  - source
  - tests
---

# render-gl — Review

## Verdict

**Solid — 74/100.** Render-gl has recognizable bedrock: RenderState/context ownership, explicit target
creation/resize/destroy, clear-preserve render-pass brackets, MSAA resolve, MRT/depth attachments,
target pooling, fullscreen passes, subject-agnostic present, texture upload, readback, shader/program
creation, material and blend registries, and a cache-invalidation handoff for raw GL consumers.

Its next depth is not a larger renderer object. It is completion of explicit storage/pass/device
contracts and deterministic ownership. Partial-target viewport/scissor remains absent in the live
branch, target reuse loses storage distinctions, present/fullscreen caches escape destruction, and the
linear-HDR present path conflates transfer encoding with display mapping.

## What is solid

- RenderState is the current command/destination context and keeps binding caches in its private runtime.
- GlRenderTarget realizes format, MSAA, MRT, depth/depth-texture, clear values, and color-space tag, with
  explicit create/resize/resolve/destroy operations.
- begin/end render pass is a nested clear-or-preserve bracket and restores framebuffer, viewport-size
  context, render target, and 2D root transform.
- Fullscreen pass and present are subject-agnostic; scene and display-object paths can share them.
- Material and fixed-function blend dispatch use opt-in open registries rather than closed global
  switches or import-time registration.
- Raw scene GL invalidates the render-state binding cache explicitly before returning control.

## Defects and depth gaps

- beginGlRenderPass always uses the full target. There is no Viewport input, scissor-constrained clear,
  or exact nested restoration of an offset rectangle.
- Target-pool matching checks width, height, primary format, and sample count only. It can return a
  target with the wrong attachment count, per-attachment formats, or depth mode.
- Resize preserves depth mode and attachment count but GlRenderTarget does not retain heterogeneous
  color formats, so a resized MRT is reallocated using the primary format for every attachment.
- Linear-to-sRGB and copy programs plus fullscreen VAOs are stored in module WeakMaps. RenderState
  destruction cannot enumerate or free them, contradicting comments that they are freed with state.
- RenderState destruction intentionally cannot enumerate texture and geometry WeakMap caches. That is
  acceptable only with complete per-owner destroy hooks and context-loss recovery; the contract is not
  yet closed.
- A linear rgba16f target is presented with only the sRGB OETF. HDR values above display white are not
  tone-mapped or gamut-mapped in the common path and clamp at the canvas.
- No explicit capability table, context-loss/recreation protocol, sampler object tier, compressed upload,
  timer query/stats, or complete cached depth/cull/color-mask setter family.
- Color space is a binary linear/sRGB tag with no primaries, white point, display transfer, or gamut
  metadata.

## Architectural conclusion

Keep RenderState as the backend-current-state object and attach private caches there. The public atoms
should remain explicit pass, target, viewport, resource, present, and destroy operations. Capability,
sampler, output-transform, and context-recreation features should arrive as individually consumed
primitives, not one device kitchen sink.
