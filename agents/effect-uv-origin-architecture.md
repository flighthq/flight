# Effect UV-Origin Architecture

**Status: ACTIVE.** Catalogues and classifies every screen-space-to-UV conversion in the GL effects
tree that requires compensation for the bottom-left UV origin, and the defects found by a sweep of
both `effects-gl` and `effects-wgpu`.

## The problem

GL fullscreen-pass UV (`v_texCoord`) has a **bottom-left origin**: `v_texCoord.y = 0` is the screen
bottom, `v_texCoord.y = 1` is the screen top. WGPU fullscreen-pass UV has a **top-left origin**:
`uv.y = 0` is the screen top, `uv.y = 1` is the screen bottom. Screen-space conventions (velocity,
positions, user-facing parameters) are Y-down.

Any GL effect that converts a screen-space quantity — a direction, position, or row index — into UV
space must compensate for this flip. When the conversion is missing, the GL and WGPU backends
produce different visual output for the same effect parameters.

## Compensation mechanisms

Three distinct mechanisms appear in the codebase:

1. **Position/index compensation** (`1.0 - v_texCoord.y`): for values that represent a screen-space
   position or row index, the GL shader converts `v_texCoord.y` to image-space Y before use.
   Examples: block index (glitch), scanline number (CRT), focus band position (tilt-shift), sine
   phase (displacement).

2. **Direction/velocity compensation** (negate Y component): for values that represent a screen-space
   direction or velocity, the GL shader negates the Y component to convert from screen-Y-down to
   UV-Y-up. Examples: motion blur velocity smear, directional blur angle.

3. **Epsilon bias compensation** (negate epsilon Y): for normalize() divide-by-zero guards that add a
   constant `vec2(1e-5)` before normalization, the GL shader negates the Y component of the epsilon
   so the fallback direction at the radial center matches the screen-space direction the WGPU epsilon
   produces. Without this, the epsilon-dominated direction at center points upward on screen in GL
   but downward in WGPU. Examples: chromatic aberration radial center, lens flare halo center.

The three mechanisms are easy to confuse because all involve the Y axis, but they apply to different
quantities. A position fix on a direction, or vice versa, produces the wrong result. Mechanism 3 is
distinct from mechanism 2: it applies to a constant bias, not a computed component, and the fix is
`vec2(1e-5, -1e-5)` rather than negating a variable.

## Correctly compensated effects (8)

| # | Effect | File | Line | Mechanism | Compensation |
|---|--------|------|------|-----------|--------------|
| 1 | Glitch block index | `glGlitchEffect.ts` | 54 | position | `(1.0 - v_texCoord.y)` |
| 2 | CRT scanlines | `glCrtEffect.ts` | 66 | position | `(1.0 - uv.y)` |
| 3 | Tilt-shift focus band | `glTiltShiftEffect.ts` | 50 | position | `(1.0 - v_texCoord.y)` |
| 4 | Displacement sine + offset | `glDisplacementEffect.ts` | 49, 55 | position + direction | `imageY = 1.0 - v_texCoord.y` for phase, negate `offset.y` for application |
| 5 | Motion blur velocity smear | `glMotionBlurEffect.ts` | 63 | direction | `vec2(velocityPixels.x, -velocityPixels.y)` |
| 6 | Directional blur angle | `glDirectionalBlurEffect.ts` | 52 | direction | `vec2(cos(u_angle), -sin(u_angle))` |
| 7 | Chromatic aberration radial epsilon | `glChromaticAberrationEffect.ts` | 49 | epsilon bias | `vec2(1e-5, -1e-5)` |
| 8 | Lens flare halo epsilon | `glLensFlareEffect.ts` | 69 | epsilon bias | `vec2(1e-5, -1e-5)` |

All eight have comments explaining the conversion.

## Confirmed defects (3)

### Defect 1: glMotionBlurEffect — velocity smear Y-flip missing (FIXED)

- **File**: `glMotionBlurEffect.ts:63`
- **Mechanism**: direction/velocity
- **Before**: `vec2 smear = (velocityPixels / u_resolution) * u_intensity;`
- **After**: `vec2 smear = vec2(velocityPixels.x, -velocityPixels.y) / u_resolution * u_intensity;`
- **Root cause**: velocity is screen-space Y-down (pixels/frame in RG channels of rgba16f). Dividing
  by resolution converts pixel magnitude to UV magnitude but does not flip the Y direction. In GL UV,
  positive Y means upward on screen, so the smear vector for a downward-moving object points upward
  in UV — the streak goes the wrong way.
- **Why it wasn't caught earlier**: the symmetric-tap proof shows that FULLY inverting the smear
  vector `(sx, sy) → (-sx, -sy)` produces the same per-pixel average. The GL UV flip produces a
  Y-REFLECTION `(sx, sy) → (sx, -sy)`, not a full inversion. The proof covers horizontal (smear.y=0)
  and vertical (smear.x=0) cases perfectly, masking the defect for axis-aligned velocities. Only
  diagonal velocities — where both components are nonzero — expose the Y-reflection as a different
  sample line than the original.

### Defect 2: glDirectionalBlurEffect — angle Y-component not negated (FIXED)

- **File**: `glDirectionalBlurEffect.ts:52`
- **Mechanism**: direction
- **Before**: `vec2 dir = vec2(cos(u_angle), sin(u_angle)) * (u_length / u_resolution);`
- **After**: `vec2 dir = vec2(cos(u_angle), -sin(u_angle)) * (u_length / u_resolution);`
- **Same mechanism as motion blur**: `sin(angle)` gives the screen-space Y component. In GL UV, this
  component points upward instead of downward. The blur line for angle θ in GL equals the blur line
  for angle (π − θ) in WGPU.
- **Visual impact**: milder than motion blur because blur is symmetric (averages both sides equally),
  so the output quality is identical — but the user's angle parameter means different diagonals on
  different backends. Axis-aligned angles (0, π/2) are unaffected.
- **Discriminating case**: the `effect-directional-blur` scene uses `angle: 0.5` (~28.6°), a diagonal
  that exposes the Y-reflection. The same symmetric-tap blind spot that masked motion blur's
  horizontal/vertical cases applies here: axis-aligned angles match trivially, and only diagonals
  expose the difference. The existing Class C PASS verdict was invalid — it was almost certainly
  verified against an axis-aligned angle.

### Defect 3: glGodRaysEffect — light position centerY not compensated (checked, already correct)

- **File**: `glGodRaysEffect.ts:62` (shader), line 27 (TypeScript uniform set)
- **Mechanism**: position
- **Original code**: `u_lightPosition = (centerX, centerY)` passed unmodified
- **Root cause**: `centerY` is a 0–1 fraction measured from the top of the image. In GL UV,
  `v_texCoord.y = 0` is the screen bottom, so `centerY = 0.2` places the light at 20% from the
  bottom instead of 20% from the top. The rays march toward the wrong screen position.
- **Status**: verified correct on the integrated tree — `glGodRaysEffect.ts:22` reads
  `const centerY = 1 - (effect.centerY ?? 0.5)`, the exact compensation this sweep prescribed. The
  fix predates this sweep's seed (ef4fae7fc), so the sweep flagged it as unfixed from a stale tree.
- **Residual**: `u_resolution` was a dead uniform (declared, set, never referenced in the shader).
  Removed together with the misleading comment that defended it.

### Defect 4: glChromaticAberrationEffect — normalize epsilon Y not reflected (FIXED)

- **File**: `glChromaticAberrationEffect.ts:49`
- **Mechanism**: epsilon bias (mechanism 3)
- **Before**: `normalize(centered + vec2(1e-5))`
- **After**: `normalize(centered + vec2(1e-5, -1e-5))`
- **Root cause**: the `vec2(1e-5)` divide-by-zero guard dominates the normalization at the radial
  center where `centered ≈ (0, 0)`. In GL UV (Y-up), epsilon Y = +1e-5 points upward on screen; in
  WGPU UV (Y-down), the same +1e-5 points downward. The fallback direction disagrees between backends.
- **Visual impact**: negligible for chromatic aberration because `scale = length(centered) * 2.0`
  kills the offset at center. The fix is a correctness-of-convention repair, not a visual fix.
- **Discriminating case**: any pixel at the exact radial center (0.5, 0.5), or close enough that the
  epsilon is a significant fraction of `centered`. The defect is invisible at off-center pixels where
  `centered` dominates.

### Defect 5: glLensFlareEffect — halo normalize epsilon Y not reflected (FIXED)

- **File**: `glLensFlareEffect.ts:69`
- **Mechanism**: epsilon bias (mechanism 3)
- **Before**: `normalize(toCenter + vec2(1e-5))`
- **After**: `normalize(toCenter + vec2(1e-5, -1e-5))`
- **Root cause**: same as defect 4 — the epsilon Y points in different screen-space directions. Unlike
  chromatic aberration, the halo sample position `v_texCoord + haloDir * u_halo` has no scale-at-center
  kill, so at the center pixel the halo samples at different screen-space positions on GL vs WGPU.
- **Discriminating case**: a pixel at the radial center with a bright region placed asymmetrically
  above/below center. The ghost sampling (which also uses `toCenter`) is self-consistent because it
  walks from the pixel toward a fixed UV point (0.5, 0.5) — no epsilon compensation needed there.

## Symmetric-invisible-but-divergent (3)

These produce technically different outputs between GL and WGPU but the visual difference is
negligible or invisible because the operation is symmetric or set-based.

| # | Effect | What diverges | Why invisible |
|---|--------|---------------|---------------|
| 1 | Dither | Bayer matrix rows indexed in opposite Y order | Same matrix, same quantization quality; pattern placement differs per-pixel |
| 2 | Halftone | Dot grid position mirrored vertically | Same dot density and quality; specific dot positions differ |
| 3 | Convolution | Kernel Y axis maps to opposite screen direction | Only visible with Y-asymmetric kernels, which are rare in practice |

## False positives (12)

Effects where `/ u_resolution` or `texelSize` is magnitude-only (radially symmetric sampling),
self-consistent within the coordinate system, or unused:

SSAO, Pixelate, SMAA, FXAA, Median, Sharpen, Kuwahara, Bokeh DoF, Sketch, Blur (Gaussian),
Box Blur, Outline. Plus `u_resolution` in `glRenderTextureEffect` (diagnostic comment) and
`glGodRaysEffect` (dead uniform — now removed; the actual defect was the light position, classified
above).

## Population reconciliation

24 GL effects examined (22 from `u_resolution`/`texelSize` grep + 2 from epsilon-bias sweep).
5 confirmed defects (4 fixed here, 1 already correct on the integrated tree) + 8 correctly
compensated (including the 4 fixed defects) + 3 symmetric-invisible + 12 false positives = 24
(the 4 fixed defects appear in both the defect list and the compensation table). 0 unexamined.

## Camera-motion-blur check

`glCameraMotionBlurEffect` and `wgpuCameraMotionBlurEffect` are NOT affected. They work entirely in
UV space using `vec2 toCenter = vec2(0.5) - v_texCoord` — no velocity buffer, no resolution
conversion, no screen-space quantity. The zoom/radial blur direction is UV-native and self-consistent.
