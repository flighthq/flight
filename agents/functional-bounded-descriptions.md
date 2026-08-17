# Bounded Expected-Image Descriptions

The running list of functional scenes whose `expectedImageDescription` states a BOUND — two or more
permitted pictures — rather than one. It exists because a bounded description is not a documentation
wrinkle: it is a commissioning constraint, and this is the record the future eligibility rule reads.

**A cell whose expected image is genuinely undecided cannot be commissioned as a permanent reference.**
Blessing one of the permitted pictures would silently resolve an open design question, in whichever
direction the capture happened to run, with no record that anyone made the call. The bound in the scene
text is the read-before-capture signal for that; this file is the list.

## The two rules a bounded description must satisfy

1. **It must NAME WHY it is bounded, in the description text itself.** "The product has not decided" and
   "whoever wrote this was not sure" are different findings with opposite remedies — one waits on a
   design ruling, the other on a careful re-read of the scene — and a reader who cannot tell them apart
   will pick the wrong one. This is the same rule that keeps `host-identity-missing` a state of its own
   rather than folding into `one-host`.
2. **Bound only when ONE FILE structurally must cover diverging backends.** Where the variants are
   separate files — `bitmap-downscale-smoothing.canvas.ts`, the `quadbatch-grid` trio — each file has
   exactly one picture and gets a precise description. Reaching for a bound where per-file precision is
   available trades a real claim for a weaker one and would put a scene on this list that does not
   belong on it.

Identical descriptions across sibling files are NOT bounds. `color-adjustment.{canvas,webgl,webgpu}` and
the `particle-emitter*` files share one text because they draw the SAME picture by construction — the
canvas variant blits an already-red source precisely so the parity image matches. One picture stated
once is a precise description that happens to be repeated, not a bound, and those scenes are not listed
here.

## The list

| scene | the bound | why it is bounded |
| --- | --- | --- |
| `swf-alpha-transform` | the fourth square is white or green, never red or blue | One file covers all four backends. WebGL and WebGPU fold the RGB transform into their tessellated solid-shape path; Canvas and DOM leave it unapplied. The scene's own header records this as current behaviour while the representation of SWF alpha-add is **under design** — so no single value is the correct one to write, and neither may be blessed until the design is decided. |

Nothing else is bounded yet. Add a row when you write one, and remove it when the underlying design is
decided and the description collapses to a single picture.
