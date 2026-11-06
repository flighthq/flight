import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { FontResource } from '@flighthq/font/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { FontVariation, TextFormat } from '@flighthq/textformat/contract';

interface TextShaperEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface CanvasTextShaperBackend extends HostTextShaperCapability {
  clearCache(): void;
}

export interface FontMetrics {
  ascent: number;
  capHeight: number;
  descent: number;
  lineGap: number;
  underlinePosition: number;
  underlineThickness: number;
  unitsPerEm: number;
  xHeight: number;
}

export interface GlyphExtents {
  height: number;
  width: number;
  xBearing: number;
  yBearing: number;
}

export interface HostTextShaperCapabilities {
  readonly shaper?: HostTextShaperCapability;
}

export interface HostTextShaperCapability {
  getCodePointForGlyph?: (glyphId: number) => number;
  getFontMetrics?: (format: Readonly<TextFormat>) => FontMetrics | null;
  getGlyphExtents?: (glyphId: number) => GlyphExtents | null;
  getGlyphIndexForCodePoint?: (codePoint: number) => number;
  getGlyphName?: (glyphId: number) => string;
  measureText: TextMeasureFunction;
  shapeRun?: (text: string, format: Readonly<TextFormat>, options?: Readonly<ShapeRunOptions>) => ShapedRun;
}

export interface ShapedGlyph {
  cluster: number;
  glyphId: number;
  xAdvance: number;
  xOffset: number;
  yAdvance: number;
  yOffset: number;
}

export interface ShapedRun {
  advanceWidth: number;
  direction: TextDirection;
  font: FontResource | null;
  glyphCount: number;
  glyphs: ShapedGlyph[];
  script: string;
}

export interface ShapeRunOptions {
  direction?: TextDirection;
  script?: string;
}

export type TextDirection = 'LeftToRight' | 'RightToLeft' | 'TopToBottom';

export const TextDirectionLeftToRight = 'LeftToRight';
export const TextDirectionRightToLeft = 'RightToLeft';
export const TextDirectionTopToBottom = 'TopToBottom';

export interface TextFeature {
  readonly end?: number;
  readonly start?: number;
  readonly tag: string;
  readonly value: number;
}

export const TextFeatureCapitals = 'c2sc';
export const TextFeatureContextualAlternates = 'calt';
export const TextFeatureDiscretionaryLigatures = 'dlig';
export const TextFeatureFractions = 'frac';
export const TextFeatureKerning = 'kern';
export const TextFeatureLigatures = 'liga';
export const TextFeatureOldStyleFigures = 'onum';
export const TextFeatureSmallCaps = 'smcp';
export const TextFeatureStylisticAlternates = 'salt';
export const TextFeatureSubscript = 'subs';
export const TextFeatureSuperscript = 'sups';
export const TextFeatureTabularFigures = 'tnum';

export interface TextItem {
  readonly direction: TextDirection;
  readonly end: number;
  readonly script: string;
  readonly start: number;
}

export type TextMeasureFunction = (text: string, format: TextFormat) => number;

export interface TextShaperCache extends TextShaperEntity {}

export type TextShaperOperation = keyof HostTextShaperCapability;

export interface TextShaperOptions {
  readonly direction?: TextDirection;
  readonly features?: readonly TextFeature[];
  readonly language?: string;
  readonly script?: string;
  readonly variations?: readonly FontVariation[];
}

export interface TextShaperSignals extends TextShaperEntity {
  onBackendChanged: Signal<(backend: HostTextShaperCapability | null) => void>;
}
