import type { ColorScaleBiasAdjustment } from '@flighthq/types/contract';
import { AdvancedBlendMode, BlendMode } from '@flighthq/types/contract';

import {
  EMPTY_ADJUSTMENTS,
  EMPTY_EFFECTS,
  joinSwfColorAdjustments,
  readSwfColorTransform,
  resolveSwfAdvancedBlendMode,
  resolveSwfBlendMode,
} from './swfAppearance';
import { SwfReader } from './swfReader';
import { BitWriter } from './swfTagStreamTestHelper';

describe('EMPTY_ADJUSTMENTS', () => {
  it('is the one empty array every untinted placement shares', () => {
    expect(EMPTY_ADJUSTMENTS).toEqual([]);
  });
});

describe('EMPTY_EFFECTS', () => {
  it('is the one empty array every unfiltered placement shares', () => {
    expect(EMPTY_EFFECTS).toEqual([]);
  });
});

describe('joinSwfColorAdjustments', () => {
  it('returns the sentinel when both channels are empty', () => {
    expect(joinSwfColorAdjustments(null, EMPTY_ADJUSTMENTS)).toBeNull();
  });

  it('returns the colour transform alone when no filter contributes one', () => {
    const colorTransform = [scaleBias(0.5)];
    expect(joinSwfColorAdjustments(colorTransform, EMPTY_ADJUSTMENTS)).toBe(colorTransform);
  });

  // The two channels are kept apart until here so a move can replace either without retaining or
  // dropping the other; the joined order is colour transform first, then the filter list's pointwise
  // members, which is the order a player applies them.
  it('concatenates the colour transform ahead of the filter adjustments', () => {
    const colorTransform = [scaleBias(0.5)];
    const filters = [scaleBias(0.25)];
    const joined = joinSwfColorAdjustments(colorTransform, filters)!;
    expect(joined).toHaveLength(2);
    expect(joined[0]).toBe(colorTransform[0]);
    expect(joined[1]).toBe(filters[0]);
  });

  it('returns the filter adjustments alone when the record tints nothing', () => {
    const filters = [scaleBias(0.25)];
    expect(joinSwfColorAdjustments(null, filters)).toEqual(filters);
  });
});

describe('readSwfColorTransform', () => {
  it('reads a pure alpha multiplier onto alpha rather than into the adjustment stack', () => {
    // A fade is the common case, and a node carries alpha directly — turning it into a colour matrix
    // would cost a descriptor per placement for something the node already expresses.
    const result = readSwfColorTransform(reader(multiplyTerms([256, 256, 256, 128])), 4);
    expect(result.alpha).toBeCloseTo(0.5);
    expect(result.colorAdjustments).toBeNull();
  });

  it('reads a colour multiplier into a scale-bias adjustment', () => {
    const result = readSwfColorTransform(reader(multiplyTerms([128, 256, 256, 256])), 4);
    expect(result.alpha).toBe(1);
    expect((result.colorAdjustments![0] as ColorScaleBiasAdjustment).colorScaleBias.redScale).toBeCloseTo(0.5);
  });

  // The legacy PlaceObject record's transform has three channels, not four: it can tint but never fade.
  it('reads a three-channel record as opaque, without consuming an alpha term', () => {
    const result = readSwfColorTransform(reader(multiplyTerms([128, 256, 256])), 3);
    expect(result.alpha).toBe(1);
    expect(result.colorAdjustments).not.toBeNull();
  });

  // A record that ran out of bits reads as the identity transform rather than as a failure: a truncated
  // CXFORM leaves the placement untinted, and the reader's own `valid` flag is what ends the stream.
  it('reads a truncated record as the identity transform', () => {
    const result = readSwfColorTransform(reader(new Uint8Array()), 4);
    expect(result).toEqual({ alpha: 1, colorAdjustments: null });
  });
});

describe('resolveSwfAdvancedBlendMode', () => {
  it('names the three destination-reading modes no node can carry', () => {
    expect(resolveSwfAdvancedBlendMode(SWF_BLEND_DIFFERENCE)).toBe(AdvancedBlendMode.Difference);
    expect(resolveSwfAdvancedBlendMode(SWF_BLEND_OVERLAY)).toBe(AdvancedBlendMode.Overlay);
    expect(resolveSwfAdvancedBlendMode(SWF_BLEND_HARD_LIGHT)).toBe(AdvancedBlendMode.HardLight);
  });

  it('returns the sentinel for a mode that folds onto the node', () => {
    expect(resolveSwfAdvancedBlendMode(SWF_BLEND_MULTIPLY)).toBeNull();
    expect(resolveSwfAdvancedBlendMode(0)).toBeNull();
  });
});

describe('resolveSwfBlendMode', () => {
  it('maps each fixed-function mode', () => {
    expect(resolveSwfBlendMode(SWF_BLEND_MULTIPLY)).toBe(BlendMode.Multiply);
    expect(resolveSwfBlendMode(SWF_BLEND_SCREEN)).toBe(BlendMode.Screen);
    expect(resolveSwfBlendMode(SWF_BLEND_LIGHTEN)).toBe(BlendMode.Lighten);
    expect(resolveSwfBlendMode(SWF_BLEND_DARKEN)).toBe(BlendMode.Darken);
    expect(resolveSwfBlendMode(SWF_BLEND_ADD)).toBe(BlendMode.Add);
  });

  // An advanced mode leaves the node Normal on purpose, so a node never renders as ordinary alpha
  // compositing while claiming the authored mode; the appearance report carries it instead.
  it('leaves an advanced mode as Normal on the node', () => {
    expect(resolveSwfBlendMode(SWF_BLEND_DIFFERENCE)).toBe(BlendMode.Normal);
    expect(resolveSwfBlendMode(SWF_BLEND_OVERLAY)).toBe(BlendMode.Normal);
  });

  it('treats both normal encodings and the layer hint as Normal', () => {
    expect(resolveSwfBlendMode(0)).toBe(BlendMode.Normal);
    expect(resolveSwfBlendMode(1)).toBe(BlendMode.Normal);
    expect(resolveSwfBlendMode(2)).toBe(BlendMode.Normal);
  });
});

// One CXFORM carrying multiply terms and no add terms, each term in 8.8 fixed point (256 is 1.0).
function multiplyTerms(terms: readonly number[]): Uint8Array {
  const writer = new BitWriter();
  writer.writeUnsigned(0, 1);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(10, 4);
  for (const term of terms) writer.writeSigned(term, 10);
  return writer.toBytes();
}

function reader(bytes: Uint8Array): SwfReader {
  return new SwfReader(bytes, 0, bytes.length);
}

function scaleBias(redScale: number): ColorScaleBiasAdjustment {
  return {
    colorScaleBias: {
      alphaBias: 0,
      alphaScale: 1,
      blueBias: 0,
      blueScale: 1,
      greenBias: 0,
      greenScale: 1,
      redBias: 0,
      redScale,
    },
    kind: 'colorScaleBias',
  } as ColorScaleBiasAdjustment;
}

const SWF_BLEND_ADD = 8;
const SWF_BLEND_DARKEN = 6;
const SWF_BLEND_DIFFERENCE = 7;
const SWF_BLEND_HARD_LIGHT = 14;
const SWF_BLEND_LIGHTEN = 5;
const SWF_BLEND_MULTIPLY = 3;
const SWF_BLEND_OVERLAY = 13;
const SWF_BLEND_SCREEN = 4;
