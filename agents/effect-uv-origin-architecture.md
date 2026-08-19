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

Two distinct mechanisms appear in the codebase:

1. **Position/index compensation** (`1.0 - v_texCoord.y`): for values that represent a screen-space
   position or row index, the GL shader converts `v_texCoord.y` to image-space Y before use.
   Examples: block index (glitch), scanline number (CRT), focus band position (tilt-shift), sine
   phase (displacement).

2. **Direction/velocity compensation** (negate Y component): for values that represent a screen-space
   direction or velocity, the GL shader negates the Y component to convert from screen-Y-down to
   UV-Y-up. Example: motion blur velocity smear.

The two mechanisms are easy to confuse because both involve the Y axis, but they apply to different
quantities. A position fix on a direction, or vice versa, produces the wrong result.

## Correctly compensated effects (4)

| # | Effect | File | Line | Mechanism | Compensation |
|---|--------|------|------|-----------|--------------|
| 1 | Glitch block index | `glGlitchEffect.ts` | 54 | position | `(1.0 - v_texCoord.y)` |
| 2 | CRT scanlines | `glCrtEffect.ts` | 66 | position | `(1.0 - uv.y)` |
| 3 | Tilt-shift focus band | `glTiltShiftEffect.ts` | 50 | position | `(1.0 - v_texCoord.y)` |
| 4 | Displacement sine + offset | `glDisplacementEffect.ts` | 49, 55 | position + direction | `imageY = 1.0 - v_texCoord.y` for phase, negate `offset.y` for application |

All four have comments explaining the conversion.

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

### Defect 2: glDirectionalBlurEffect — angle Y-component not negated

- **File**: `glDirectionalBlurEffect.ts:51`
- **Mechanism**: direction
- **Code**: `vec2 dir = vec2(cos(u_angle), sin(u_angle)) * (u_length / u_resolution);`
- **Same mechanism as motion blur**: `sin(angle)` gives the screen-space Y component. In GL UV, this
  component points upward instead of downward. The blur line for angle θ in GL equals the blur line
  for angle (π − θ) in WGPU.
- **Visual impact**: milder than motion blur because blur is symmetric (averages both sides equally),
  so the output quality is identical — but the user's angle parameter means different diagonals on
  different backends. Axis-aligned angles (0, π/2) are unaffected.
- **Fix**: `vec2 dir = vec2(cos(u_angle), -sin(u_angle)) * (u_length / u_resolution);`

### Defect 3: glGodRaysEffect — light position centerY not compensated

- **File**: `glGodRaysEffect.ts:62` (shader), line 27 (TypeScript uniform set)
- **Mechanism**: position
- **Code**: `u_lightPosition = (centerX, centerY)` passed unmodified; shader uses
  `vec2 delta = (v_texCoord - u_lightPosition) * (u_density / SAMPLES);`
- **Root cause**: `centerY` is a 0–1 fraction measured from the top of the image. In GL UV,
  `v_texCoord.y = 0` is the screen bottom, so `centerY = 0.2` places the light at 20% from the
  bottom instead of 20% from the top. The rays march toward the wrong screen position.
- **Note**: `u_resolution` is declared as a GL uniform but is UNUSED in the shader body (dead
  uniform). The defect is purely about `u_lightPosition.y`.
- **Fix**: pass `(centerX, 1.0 - centerY)` as `u_lightPosition` in the TypeScript code.

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
`glGodRaysEffect` (dead uniform — the actual defect is the light position, classified above).

## Population reconciliation

22 GL effects with `u_resolution` or `texelSize` grep hits. All 22 classified:
3 confirmed defects + 4 correctly compensated + 3 symmetric-invisible + 12 false positives = 22.
0 unexamined.

## Camera-motion-blur check

`glCameraMotionBlurEffect` and `wgpuCameraMotionBlurEffect` are NOT affected. They work entirely in
UV space using `vec2 toCenter = vec2(0.5) - v_texCoord` — no velocity buffer, no resolution
conversion, no screen-space quantity. The zoom/radial blur direction is UV-native and self-consistent.
