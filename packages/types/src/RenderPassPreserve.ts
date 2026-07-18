// The per-use clear-vs-preserve decision for a render pass (beginGlRenderPass / the future
// beginWgpuRenderPass). A pass CLEARS every aspect of its target by default; this optional descriptor
// spares specific aspects, naming only what to KEEP. It carries no clear values: those are fixed on the
// target (RenderTargetDescriptor.clearColors / clearDepth), because what a target clears to is a
// property of the target, while whether to clear this time is the only thing that varies per pass.
//
// This is the clear/preserve model, deliberately NOT GL/Vulkan "load ops": no abbreviations, no "load"
// vocabulary. `preserveColor` as a boolean applies to every color attachment; as an array it is indexed
// by attachment location — index i is the attachment the fragment shader writes with `layout(location =
// i)`, i.e. GlRenderTarget.textures[i] — with missing or short entries defaulting to clear. Per-attachment
// preserve is the MRT / G-buffer path; the scalar boolean covers the single-attachment common case.
export interface RenderPassPreserve {
  preserveColor?: boolean | ReadonlyArray<boolean>;
  preserveDepth?: boolean;
}
