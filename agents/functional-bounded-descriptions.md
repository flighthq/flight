# Bounded Expected-Image Descriptions

The running list of functional scenes whose `expectedImageDescription` states a BOUND — two or more
permitted pictures — rather than one.

★ A BOUND IS NOT BY ITSELF A REASON TO WITHHOLD A CELL, AND READING IT THAT WAY WOULD BLOCK WORK THAT IS
FINE. The question is not "does the text name more than one picture" but **is there a fact of the matter
about which pixels are correct**. Two bounded scenes can sit either side of that line:

| kind | what it means | commissioning |
| --- | --- | --- |
| **undecided design** | the product has not decided what the right pixels ARE, so no capture can be blessed without silently settling the question in whichever direction it happened to run | **ineligible** until the design is ruled |
| **stable known per-backend difference** | each backend's output is correct FOR ITS OWN BACKEND; nothing is open, the bound exists only because one FILE covers several renderers | **eligible** |

★ AND THE SECOND REASON IS CLEANER THAN THE FIRST: the description is per-FILE, the blessing is per-CELL.
A shared file constrains the prose and nothing else, because commissioning does not operate on files. Any
future eligibility rule must key on the KIND column below, never on the presence of a row.

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

| scene | kind | the bound | why it is bounded |
| --- | --- | --- | --- |
| `swf-alpha-transform` | **undecided design — INELIGIBLE** | the fourth square is white or green, never red or blue | One file covers all four backends. WebGL and WebGPU fold the RGB transform into their tessellated solid-shape path; Canvas and DOM leave it unapplied. The scene's own header records this as current behaviour while the representation of SWF alpha-add is **under design** — so there is no fact of the matter yet about which is right, and blessing either would settle it by accident. |
| `swf-import` | **stable known per-backend difference — ELIGIBLE** | the tenth piece, a 100x100 square at x 600-700, y 400-500, is flat white or a yellow-green of roughly R128 G255 B51, never any other colour | Two renderers register colour adjustment and fold the inherited transform; two do not, and must leave the imported cell untinted — the scene asserts both arms explicitly. Each output is correct for its own backend and nothing is undecided, so the bound describes the shared FILE, not a doubt about any cell. |

| `material-blend-modes` | **stable known per-backend difference — ELIGIBLE** | every column and row is pinned in position and in ordinal relation to the backdrop, but no absolute level is: the scene renders through an HDR `rgba16f` target and is tone-presented, so the magnitude of "lighter" and "darker" follows each backend's own present curve | Two things are deliberately left unpinned and both are named in the description text. (1) Magnitudes: tone-presentation makes the exact grey of a composited patch a property of the backend curve, so the description states orderings and leaves levels open — nothing is undecided, each backend is correct for itself. (2) Scope: the assertion samples the RED CHANNEL only, one point per cell, and checks Darken at no row and Lighten at zero coverage — the zero-coverage row therefore carries a solid BLACK square in the Darken column on **both** backends, because `MIN(ONE, ONE)` cannot carry the coverage term and computes `min(0, dst) = 0`. That is a recorded fixed-function limitation with its fix living in `AdvancedBlendMode`, not an open design question, and the description says so rather than omitting the row — a description that looks complete and is not is the same failure as "covered means non-empty" moved from the gate to the content. |

| `text-border-box` | **stable known per-backend difference — ELIGIBLE** | the outline's edge is antialiased on canvas/webgl/wgpu and hard on dom, so a thin graded fringe against the black field is correct on three backends and wrong on the fourth | One file covers all four renderers, and they draw the border by different means: canvas, webgl and wgpu stroke a 1 px rectangle CENTRED on the box path, which rasterizes with antialiased shoulders, while dom applies a CSS `1px solid` border on the INSIDE edge, integer-aligned and hard. Each output is correct for its own backend and nothing is undecided, so the bound describes the shared FILE. The scene's own header records the split, and its assertion accommodates rather than measures it — a band from 2 px above to 3 px below the top edge, needing 12 border-coloured samples. The description previously claimed no part of the outline was graded or blurred, which was false on three of the four. |

Add a row when you write a bound, with its KIND. Remove a row when the bound goes away: an
undecided-design row disappears when the design is ruled and the text collapses to one picture; a
stable-known row disappears if the backends converge. **Changing a row's kind is a commissioning
decision, not an edit** — `swf-import` moved from unlisted to eligible only after a ruling.
