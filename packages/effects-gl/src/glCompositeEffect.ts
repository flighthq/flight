import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type {
  CompositeEffect,
  CompositeOperator,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
} from '@flighthq/types';
import { CompositeOperator as CompositeOperatorValues } from '@flighthq/types';

import { getGlBlendEffectBackdrop } from './glBlendEffect';
import { getGlEffectProgram, getGlEffectUniformLocation } from './glEffectProgramCache';

// Porter-Duff composite pass: sample the incoming layer (`u_texture0`, the effect's `source`) and a
// registered backdrop (`u_texture1`), combine them with the coverage factors of the effect's `operator`
// (`Fa*layer + Fb*backdrop` on premultiplied color), and write to `dest`. This is the GL realization of
// the CompositeEffect — the fixed-function-cost sibling of the shader-based BlendEffect. The GLSL factor
// formulas mirror @flighthq/effects compositeOperatorMath exactly, so the pass is verified against those
// plain-number tests.
//
// The backdrop is shared with BlendEffect: looked up by the effect's `backdropKey` in the per-state
// registry populated by registerGlBlendEffectBackdrop. A null/unregistered key composites over an implicit
// transparent backdrop (source-over reduces to passthrough; erase/mask reduce to clear) rather than
// erroring.
export function applyCompositeEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<CompositeEffect>,
): void {
  const backdrop = getGlBlendEffectBackdrop(state, effect.backdropKey ?? null);
  const program = getGlEffectProgram(state, 'composite.porterduff', COMPOSITE_FRAGMENT_SRC);
  const operatorIndex = getCompositeEffectOperatorIndex(effect.operator);
  const hasBackdrop = backdrop !== null;

  // Bind the layer to unit 0 and the backdrop (or the layer itself as a harmless stand-in) to unit 1;
  // `u_hasBackdrop` gates whether unit 1 is read, so a missing backdrop composites over transparent.
  const inputs = [source.texture, hasBackdrop ? (backdrop as WebGLTexture) : source.texture];
  drawGlFullscreenPass(state, program, inputs, dest, (gl, p) => {
    const operatorLoc = getGlEffectUniformLocation(state, p, 'u_operator');
    const hasBackdropLoc = getGlEffectUniformLocation(state, p, 'u_hasBackdrop');
    if (operatorLoc !== null) gl.uniform1i(operatorLoc, operatorIndex);
    if (hasBackdropLoc !== null) gl.uniform1i(hasBackdropLoc, hasBackdrop ? 1 : 0);
  });
}

export const defaultGlCompositeEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyCompositeEffectToGl(ctx.state, ctx.source, ctx.dest, effect as CompositeEffect);
};

// Maps a CompositeOperator string to the integer the fragment shader switches on. Kept in lockstep with
// the COMPOSITE_FRAGMENT_SRC branch order; an unknown (vendor) operator maps to 0 (SourceOver).
export function getCompositeEffectOperatorIndex(operator: CompositeOperator): number {
  return COMPOSITE_OPERATOR_INDEX[operator] ?? 0;
}

// CompositeOperator → shader branch index. Kept in lockstep with the if-chain in COMPOSITE_FRAGMENT_SRC
// and with the factor formulas in @flighthq/effects compositeOperatorMath.
const COMPOSITE_OPERATOR_INDEX: Readonly<Record<string, number>> = {
  [CompositeOperatorValues.SourceOver]: 0,
  [CompositeOperatorValues.DestinationOver]: 1,
  [CompositeOperatorValues.SourceIn]: 2,
  [CompositeOperatorValues.DestinationIn]: 3,
  [CompositeOperatorValues.SourceOut]: 4,
  [CompositeOperatorValues.DestinationOut]: 5,
  [CompositeOperatorValues.SourceAtop]: 6,
  [CompositeOperatorValues.DestinationAtop]: 7,
  [CompositeOperatorValues.Xor]: 8,
  [CompositeOperatorValues.Copy]: 9,
  [CompositeOperatorValues.Clear]: 10,
};

// Premultiplied Porter-Duff fragment shader. Layer = u_texture0, backdrop = u_texture1, both premultiplied.
// The composited pixel is `Fa*layer + Fb*backdrop`, where Fa/Fb depend on the operator and the coverage
// alphas (as = layer.a, ab = backdrop.a) — the same factors as compositeOperatorMath. Premultiplication is
// what lets one factor pair drive rgb and a alike, so no un-premultiply is needed (unlike BlendEffect).
const COMPOSITE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform int u_operator;
uniform int u_hasBackdrop;
out vec4 o_color;

void main() {
  vec4 layer = texture(u_texture0, v_texCoord);
  vec4 back = u_hasBackdrop == 1 ? texture(u_texture1, v_texCoord) : vec4(0.0);
  float as = layer.a;
  float ab = back.a;

  float fa = 1.0;
  float fb = 1.0 - as;                                              // SourceOver (0, default)
  if (u_operator == 1) { fa = 1.0 - ab; fb = 1.0; }                 // DestinationOver
  else if (u_operator == 2) { fa = ab; fb = 0.0; }                  // SourceIn
  else if (u_operator == 3) { fa = 0.0; fb = as; }                  // DestinationIn
  else if (u_operator == 4) { fa = 1.0 - ab; fb = 0.0; }            // SourceOut
  else if (u_operator == 5) { fa = 0.0; fb = 1.0 - as; }            // DestinationOut
  else if (u_operator == 6) { fa = ab; fb = 1.0 - as; }            // SourceAtop
  else if (u_operator == 7) { fa = 1.0 - ab; fb = as; }            // DestinationAtop
  else if (u_operator == 8) { fa = 1.0 - ab; fb = 1.0 - as; }      // Xor
  else if (u_operator == 9) { fa = 1.0; fb = 0.0; }                // Copy
  else if (u_operator == 10) { fa = 0.0; fb = 0.0; }               // Clear

  o_color = fa * layer + fb * back;
}`;
