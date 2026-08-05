---
package: '@flighthq/tool-capture'
updated: 2026-08-05
by: principal
---

# tool-capture — Status Log

## [2026-08-05 · principal] — the blank-frame class of bug, closed at every layer

First entry in this log; the cell had no `status.md` until now, so the 53 commits since the
2026-07-13 review had no continuity prose at all.

They are dominated by one theme worth naming, because the individual subjects hide it: **a capture
that drew nothing was passing as a successful capture**, and the fix had to land at every layer
independently. Blank frames are now hard-rejected at the baseline write path; a uniform fingerprint
is refused as a baseline; a gated regression or parity run that compared nothing fails instead of
passing silently; a registry miss that means nothing drew fails the capture; and a WebGL capture
whose verifier produced no render image fails rather than passing as black. Measured pixel coverage —
not verifier-publish — became the source of truth for "blank".

The `observe <url>` bin is the other substantial addition: zero-integration capture of any canvas
page, grabbing frames from intercepted GL contexts, warming up app-loop pages until they actually
draw, and emitting a screenshot plus diagnostics on a blank render. Warmup halts on measured pixels.

A stalled verifier now reports which await it is sitting in, and the per-wait capture budget resolves
from a flag or the environment, with in-page verifier waits derived from it. That was the diagnostic
gap behind the earlier bare did-not-run sentinel.

Watch for: frame waits are skipped on WebGPU and bounded elsewhere, so WebGPU stall behavior is not
covered by the same guarantees as WebGL. Regression baseline freshness is classified, but the
classification is advisory rather than gating.

