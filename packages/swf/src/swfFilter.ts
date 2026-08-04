import { createColorMatrixAdjustment } from '@flighthq/adjustments/contract';
import {
  createBevelEffect,
  createBlurEffect,
  createConvolutionEffect,
  createDropShadowEffect,
  createGradientBevelEffect,
  createGradientGlowEffect,
  createInnerGlowEffect,
  createOuterGlowEffect,
} from '@flighthq/effects/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import type { Adjustment, RenderEffect } from '@flighthq/types/contract';

import type { SwfReader } from './swfReader';

// Reads a SURFACEFILTERLIST into the two tiers Flight splits image operations across, appending to the
// arrays the caller owns. The split is the architecture, not a convenience: a colour matrix is a
// pointwise remap that fuses with every other adjustment and folds into the draw, so it joins the node's
// adjustment stack; the other seven read neighbouring pixels and are spatial composites, so they become
// effect descriptors the caller runs through the effect pipeline explicitly. Nothing here attaches an
// effect to a node — see agents/anti-goals.md.
//
// The reader must be positioned at the filter count. A filter this does not recognize ends the list,
// because filters are variable-width and a skipped one would desynchronize every record after it.
export function readSwfFilterList(reader: SwfReader, outEffects: RenderEffect[], outAdjustments: Adjustment[]): void {
  const count = reader.readUint8();
  for (let index = 0; index < count && reader.valid; index++) {
    const id = reader.readUint8();
    if (!reader.valid) return;
    if (id === FILTER_DROP_SHADOW) {
      const color = readSwfFilterColor(reader);
      const blurX = readSwfFilterFixed(reader);
      const blurY = readSwfFilterFixed(reader);
      const angle = readSwfFilterFixed(reader) * RAD_TO_DEG;
      const distance = readSwfFilterFixed(reader);
      const strength = reader.readFixed8();
      const flags = reader.readUint8();
      if (!reader.valid) return;
      // An inner drop shadow is the same recipe clipped to the source silhouette, which is what the
      // inner-glow effect already is; the offset is what makes it a shadow rather than a glow, and no
      // inner effect carries one, so an inner shadow keeps its blur and loses its offset.
      outEffects.push(
        (flags & FILTER_INNER) !== 0
          ? createInnerGlowEffect({
              alpha: color.alpha,
              blurX,
              blurY,
              color: color.rgb,
              quality: flags & FILTER_PASSES,
              strength,
            })
          : createDropShadowEffect({
              alpha: color.alpha,
              angle,
              blurX,
              blurY,
              color: color.rgb,
              distance,
              quality: flags & FILTER_PASSES,
              strength,
            }),
      );
      continue;
    }
    if (id === FILTER_BLUR) {
      const blurX = readSwfFilterFixed(reader);
      const blurY = readSwfFilterFixed(reader);
      reader.readUint8();
      if (!reader.valid) return;
      outEffects.push(createBlurEffect({ blurX, blurY }));
      continue;
    }
    if (id === FILTER_GLOW) {
      const color = readSwfFilterColor(reader);
      const blurX = readSwfFilterFixed(reader);
      const blurY = readSwfFilterFixed(reader);
      const strength = reader.readFixed8();
      const flags = reader.readUint8();
      if (!reader.valid) return;
      const options = {
        alpha: color.alpha,
        blurX,
        blurY,
        color: color.rgb,
        quality: flags & FILTER_PASSES,
        strength,
      };
      outEffects.push((flags & FILTER_INNER) !== 0 ? createInnerGlowEffect(options) : createOuterGlowEffect(options));
      continue;
    }
    if (id === FILTER_BEVEL) {
      const shadow = readSwfFilterColor(reader);
      const highlight = readSwfFilterColor(reader);
      const blurX = readSwfFilterFixed(reader);
      const blurY = readSwfFilterFixed(reader);
      const angle = readSwfFilterFixed(reader) * RAD_TO_DEG;
      const distance = readSwfFilterFixed(reader);
      const strength = reader.readFixed8();
      const flags = reader.readUint8();
      if (!reader.valid) return;
      outEffects.push(
        createBevelEffect({
          angle,
          bevelType: resolveSwfBevelType(flags),
          blurX,
          blurY,
          distance,
          highlightAlpha: highlight.alpha,
          highlightColor: highlight.rgb,
          quality: flags & FILTER_BEVEL_PASSES,
          shadowAlpha: shadow.alpha,
          shadowColor: shadow.rgb,
          strength,
        }),
      );
      continue;
    }
    if (id === FILTER_GRADIENT_GLOW || id === FILTER_GRADIENT_BEVEL) {
      const stopCount = reader.readUint8();
      const colors: number[] = [];
      const alphas: number[] = [];
      const ratios: number[] = [];
      for (let stop = 0; stop < stopCount; stop++) {
        const color = readSwfFilterColor(reader);
        colors.push(color.rgb);
        alphas.push(color.alpha);
      }
      // The ratio table follows the whole colour table rather than interleaving with it, and is already
      // in the byte scale a Flight gradient ramp reads.
      for (let stop = 0; stop < stopCount; stop++) ratios.push(reader.readUint8());
      const blurX = readSwfFilterFixed(reader);
      const blurY = readSwfFilterFixed(reader);
      const angle = readSwfFilterFixed(reader) * RAD_TO_DEG;
      const distance = readSwfFilterFixed(reader);
      const strength = reader.readFixed8();
      const flags = reader.readUint8();
      if (!reader.valid) return;
      outEffects.push(
        id === FILTER_GRADIENT_GLOW
          ? createGradientGlowEffect({
              alphas,
              blurX,
              blurY,
              colors,
              quality: flags & FILTER_BEVEL_PASSES,
              ratios,
              strength,
            })
          : createGradientBevelEffect({
              alphas,
              angle,
              bevelType: resolveSwfBevelType(flags),
              blurX,
              blurY,
              colors,
              distance,
              quality: flags & FILTER_BEVEL_PASSES,
              ratios,
              strength,
            }),
      );
      continue;
    }
    if (id === FILTER_CONVOLUTION) {
      const matrixX = reader.readUint8();
      const matrixY = reader.readUint8();
      const divisor = readSwfFilterFloat(reader);
      const bias = readSwfFilterFloat(reader);
      const matrix: number[] = [];
      for (let cell = 0; cell < matrixX * matrixY && reader.valid; cell++) matrix.push(readSwfFilterFloat(reader));
      const color = readSwfFilterColor(reader);
      const flags = reader.readUint8();
      if (!reader.valid || matrix.length !== matrixX * matrixY) return;
      outEffects.push(
        createConvolutionEffect({
          bias,
          clamp: (flags & CONVOLUTION_CLAMP) !== 0,
          color: color.rgb,
          divisor,
          matrix,
          matrixX,
          matrixY,
          preserveAlpha: (flags & CONVOLUTION_PRESERVE_ALPHA) !== 0,
        }),
      );
      continue;
    }
    if (id === FILTER_COLOR_MATRIX) {
      const matrix: number[] = [];
      for (let cell = 0; cell < COLOR_MATRIX_LENGTH && reader.valid; cell++) matrix.push(readSwfFilterFloat(reader));
      if (!reader.valid) return;
      // SWF writes the offset column in the 0-255 byte domain; Flight's colour matrix takes a normalized
      // bias, so only that fifth column of each row converts.
      for (let row = 0; row < COLOR_MATRIX_ROWS; row++) {
        matrix[row * COLOR_MATRIX_COLUMNS + COLOR_MATRIX_BIAS_COLUMN] /= COLOR_CHANNEL_ONE;
      }
      outAdjustments.push(createColorMatrixAdjustment(matrix));
      continue;
    }
    return;
  }
}

// A filter's RGBA, split into the packed RGB and normalized alpha every effect descriptor takes.
function readSwfFilterColor(reader: SwfReader): { alpha: number; rgb: number } {
  const red = reader.readUint8();
  const green = reader.readUint8();
  const blue = reader.readUint8();
  const alpha = reader.readUint8();
  return { alpha: alpha / COLOR_CHANNEL_ONE, rgb: red * 0x10000 + green * 0x100 + blue };
}

// FIXED: a signed 16.16 fixed-point value. Blur radii, angles and distances are all written this way.
function readSwfFilterFixed(reader: SwfReader): number {
  const value = reader.readUint32();
  return (value >= 0x80000000 ? value - 0x100000000 : value) / FIXED_16_ONE;
}

function readSwfFilterFloat(reader: SwfReader): number {
  _floatBytes[0] = reader.readUint32();
  return _floatValues[0];
}

// SWF spells a bevel's placement as two independent flags; Flight names the three combinations. An inner
// shadow wins over `onTop`, which is what a player does with a record that sets both.
function resolveSwfBevelType(flags: number): 'full' | 'inner' | 'outer' {
  if ((flags & FILTER_INNER) !== 0) return 'inner';
  return (flags & FILTER_BEVEL_ON_TOP) !== 0 ? 'full' : 'outer';
}

const COLOR_CHANNEL_ONE = 0xff;
const COLOR_MATRIX_BIAS_COLUMN = 4;
const COLOR_MATRIX_COLUMNS = 5;
const COLOR_MATRIX_LENGTH = 20;
const COLOR_MATRIX_ROWS = 4;
const CONVOLUTION_CLAMP = 0x02;
const CONVOLUTION_PRESERVE_ALPHA = 0x01;
const FILTER_BEVEL = 3;
// A plain bevel and the two gradient filters spend one flag bit on `onTop`, leaving four for the pass
// count where a drop shadow has five.
const FILTER_BEVEL_ON_TOP = 0x10;
const FILTER_BEVEL_PASSES = 0x0f;
const FILTER_BLUR = 1;
const FILTER_COLOR_MATRIX = 6;
const FILTER_CONVOLUTION = 5;
const FILTER_DROP_SHADOW = 0;
const FILTER_GLOW = 2;
const FILTER_GRADIENT_BEVEL = 7;
const FILTER_GRADIENT_GLOW = 4;
const FILTER_INNER = 0x80;
const FILTER_PASSES = 0x1f;
const FIXED_16_ONE = 0x10000;
// One scratch buffer reinterprets a filter's IEEE-754 word as the float it encodes, so no allocation
// happens per value read.
const _floatBuffer = new ArrayBuffer(4);
const _floatBytes = new Uint32Array(_floatBuffer);
const _floatValues = new Float32Array(_floatBuffer);
