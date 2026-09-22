import { createColorScaleBiasAdjustment } from '@flighthq/adjustments/contract';
import type { Adjustment, Effect, SwfTagReader } from '@flighthq/types/contract';
import { AdvancedBlendMode, BlendMode } from '@flighthq/types/contract';

import { FIXED_8_8_ONE } from './swfPrimitive';

// How a SWF tints and blends what it places. The CXFORM record and the blend enumeration are shared by
// the two families that carry appearance on a record: placement, on every PlaceObject, and control, on
// each of a button's state records.

// Concatenates the two pointwise sources a placement can carry — its colour transform and a colour-matrix
// filter from its filter list — into the single stack a node takes, in the order SWF applies them: the
// transform tints the object, then a filter operates on the result. Returns null rather than an empty
// array so an untinted placement compares equal to the untinted default by reference.
export function joinSwfColorAdjustments(
  colorTransform: readonly Adjustment[] | null,
  filters: readonly Adjustment[],
): readonly Adjustment[] | null {
  if (filters.length === 0) return colorTransform;
  return colorTransform === null ? filters : [...colorTransform, ...filters];
}

// Reads a colour transform (`C' = C * multiply / 256 + add`) and splits it across the two places Flight
// carries colour on a node. The alpha multiplier becomes `node.alpha`, because that is the channel the
// render walk concatenates down a subtree — the same thing SWF's own transform does for a sprite, and
// the reason the multiplier does not ride in the adjustment. Everything else becomes a
// ColorScaleBiasAdjustment: the Adjustment tier's `out = in * scale + bias` is exactly a CXFORM, with
// SWF's byte-domain add terms normalized at this seam.
//
// The alpha add is pre-divided by the alpha multiply so that composing the two — the adjustment first,
// `node.alpha` at draw — reproduces SWF's `A * multiply + add` exactly. A record with a zero alpha
// multiply and a non-zero add cannot be expressed that way and drops its add; the node is fully
// transparent either way in every other respect.
export function readSwfColorTransform(reader: SwfTagReader, channelCount = 4): SwfColorTransform {
  const hasAdd = reader.readUnsignedBits(1) !== 0;
  const hasMultiply = reader.readUnsignedBits(1) !== 0;
  const bits = reader.readUnsignedBits(4);
  const multiply = [1, 1, 1, 1];
  const add = [0, 0, 0, 0];
  if (hasMultiply) {
    for (let i = 0; i < channelCount; i++) multiply[i] = reader.readSignedBits(bits) / FIXED_8_8_ONE;
  }
  if (hasAdd) {
    for (let i = 0; i < channelCount; i++) add[i] = reader.readSignedBits(bits) / COLOR_CHANNEL_ONE;
  }
  reader.alignToByte();

  const alpha = channelCount > ALPHA_CHANNEL ? Math.max(0, Math.min(1, multiply[ALPHA_CHANNEL])) : 1;
  const alphaBias = alpha > 0 ? add[ALPHA_CHANNEL] / alpha : 0;
  const tints =
    multiply[0] !== 1 || multiply[1] !== 1 || multiply[2] !== 1 || add[0] !== 0 || add[1] !== 0 || add[2] !== 0;
  if (!tints && alphaBias === 0) return { alpha, colorAdjustments: null };
  return {
    alpha,
    colorAdjustments: [
      createColorScaleBiasAdjustment({
        alphaBias,
        alphaScale: 1,
        blueBias: add[2],
        blueScale: multiply[2],
        greenBias: add[1],
        greenScale: multiply[1],
        redBias: add[0],
        redScale: multiply[0],
      }),
    ],
  };
}

// The advanced half of the blend split. Flight separates the modes that fold into fixed-function blend
// state from the destination-reading and non-separable ones, which need a BlendEffect bouncing through
// an offscreen — so a mode in the second set is reported rather than assigned, and assigning it to
// `node.blendMode` to get a silent Normal is exactly the bug the split exists to prevent.
//
// SWF's remaining modes have no home in either tier: `layer` is a compositing hint rather than a blend,
// and subtract, invert, alpha and erase are destination-alpha operations Flight does not express. They
// stay Normal and are not reported, because there is nothing a caller could apply.
export function resolveSwfAdvancedBlendMode(value: number): AdvancedBlendMode | null {
  if (value === SWF_BLEND_DIFFERENCE) return AdvancedBlendMode.Difference;
  if (value === SWF_BLEND_OVERLAY) return AdvancedBlendMode.Overlay;
  return value === SWF_BLEND_HARD_LIGHT ? AdvancedBlendMode.HardLight : null;
}

export function resolveSwfBlendMode(value: number): BlendMode {
  if (value === SWF_BLEND_MULTIPLY) return BlendMode.Multiply;
  if (value === SWF_BLEND_SCREEN) return BlendMode.Screen;
  if (value === SWF_BLEND_LIGHTEN) return BlendMode.Lighten;
  if (value === SWF_BLEND_DARKEN) return BlendMode.Darken;
  return value === SWF_BLEND_ADD ? BlendMode.Add : BlendMode.Normal;
}

// One CXFORM, already split into the two homes a node gives it. See readSwfColorTransform.
export interface SwfColorTransform {
  alpha: number;
  colorAdjustments: readonly Adjustment[] | null;
}

export const EMPTY_ADJUSTMENTS: readonly Adjustment[] = [];

// A placement with no filter list shares one empty array, so an untouched effect list compares equal by
// reference across every frame and instance.
export const EMPTY_EFFECTS: readonly Effect[] = [];

// PlaceObject3 blend-mode values. 0 and 1 are both normal, and `layer` (2) is a compositing hint rather
// than a blend, so none of the three is named here.
const SWF_BLEND_ADD = 8;
const SWF_BLEND_DARKEN = 6;
const SWF_BLEND_DIFFERENCE = 7;
const SWF_BLEND_HARD_LIGHT = 14;
const SWF_BLEND_LIGHTEN = 5;
const SWF_BLEND_MULTIPLY = 3;
const SWF_BLEND_OVERLAY = 13;
const SWF_BLEND_SCREEN = 4;

// A CXFORM's multiply terms are 8.8 fixed and its add terms are whole colour channels.
const ALPHA_CHANNEL = 3;
const COLOR_CHANNEL_ONE = 0xff;
