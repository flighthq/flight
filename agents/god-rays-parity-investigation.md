# god-rays GL/WGPU parity: root cause and elimination record

Status: root cause DERIVED, not yet fixed. Written so the investigation transfers without its author.

## Root cause

**The two backends' effect-pass UV spaces are vertically opposite, and the god-rays light centre is
passed into both unchanged.** Same shader text, same uniform value, opposite meaning.

    GL    packages/render-gl/src/glFullscreenPass.ts — the quad's own comment says it:
          "a clip-space quad with bottom-left-origin texcoords"
          corner (x=-1, y=-1) -> uv (0,0); clip y=-1 is the screen BOTTOM, so v grows UPWARD

    WGPU  packages/effects-wgpu/src/wgpuEffectPass.ts
          out.position.y = select(-1.0, 1.0, yi);  out.uv.y = select(1.0, 0.0, yi)
          yi=true -> clip y=+1 (screen TOP) with uv.y = 0, so v grows DOWNWARD

Both runners pass the descriptor through untouched (`effect.centerY ?? 0.5`), so `centerY: 0.4` resolves
to different screen rows:

    WGPU   y = 0.4 * H         = 240 px
    GL     y = (1 - 0.4) * H   = 360 px

A 120 px separation, mirrored about the frame centre. Every ray direction is `uv - light` in that space,
so the whole radial field points elsewhere on GL — which is what the user reported ("god rays radiate in
different directions"), and it is a structural difference rather than filtering noise.

## Which side is wrong: GL

The scene draws its bright white 80x80 core at screen **(400, 240)** and its own comment states the
intent — "Bright core at the light center (centerX 0.5, centerY 0.4)". WGPU puts the light on the core.
GL puts it 120 px below the core, in empty background.

## Second defect, in the description

Both siblings share one text: *"Radial light streaks emanate outward from the central white core…"*.
True on WGPU, false on GL, where the streaks emanate from a point 120 px below the core. The GL cell's
description describes output GL does not produce.

## Why no gate caught it

`assertRender` probes `x = width - 10`, `y = round(height * 0.4) = 240`. On WGPU that is the ray axis. On
GL the ray axis is y = 360, so the probe sits off-axis — and passes anyway, because the rays are broad
enough to light that row. The assertion is blind to the defect it appears to test.

## Elimination record — four hypotheses tested and refuted before the derivation

Kept because a refuted hypothesis is the expensive part to reproduce.

| # | hypothesis | test | result |
| --- | --- | --- | --- |
| 1 | WGPU silently downgrades `sampleCount: 4` to 1 (true, `wgpuRenderEffectPipeline.ts:88-91`), so GL blurs antialiased edges and WGPU aliased ones | forced the GL scene to `sampleCount: 1`, recaptured | REFUTED — god-rays 84.51% differ at mean 54.0 with MSAA, 84.56% at 53.9 without; directional-blur 7.71%/39.3 vs 7.53%/40.3 |
| 2 | a whole-image Y flip between backends | compared GL against a vertically flipped WGPU | REFUTED as stated, but INFORMATIVE: flipping made it worse (93.08% at mean 100.5 vs 84.51% at 54.0). Only the light POSITION is mirrored; scene content is not, so flipping the whole image mirrors correct content too. That is the fingerprint of one flip in the seam rather than in the image |
| 3 | sub-pixel or whole-pixel misalignment | mean absolute difference for every offset dx,dy in {-1,0,1} | REFUTED — minimum at (0,0) = 2.43, all eight neighbours 2.46-2.50 |
| 4 | the scene rasterises differently before the effect | emptied the effect list on both backends and captured the bare scene | PARTLY TRUE and insufficient: sources differ by 1128 px (0.23%, mean 87, balanced 552/576), which god-rays amplifies ~370x in area — but it does not explain a directional difference |

Two method notes that cost real time:

- The bare-scene capture needs TWO edits, not one. Emptying the effect list makes the scene's own
  `assertRender` fail (`ray-axis pixel at far edge has luminance 6.2, expected > 8`), and the harness
  writes no screenshot for a failed cell, so the assertion has to be neutralised as well.
- Identical shader TEXT does not mean identical shader INPUTS. The line-by-line comparison that proved
  the GLSL and WGSL bodies equivalent is what kept the real cause invisible for four rounds: the
  divergence is in the coordinate space the uniform lands in, one layer below the shader.

## Why directional-blur is unaffected by the same seam defect

Its taps run `t = i/(count-1) - 0.5`, symmetric about zero, so reversing the direction maps the tap set
onto itself and the flip is unobservable. One mechanism explains both cells: god-rays is asymmetric about
its light and shows it; directional-blur is symmetric and hides it.

## Not fixed here

Which side changes is a cross-package call: either GL's fullscreen quad adopts top-left-origin texcoords
(touching every GL effect that reads `v_texCoord` asymmetrically), or the god-rays runners convert the
centre into their own space at the seam, or the descriptor's `centerY` is defined with an explicit origin
and both runners normalise to it. The third is the only one that makes the public parameter unambiguous.
