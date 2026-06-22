import type { RenderEffect } from './RenderEffect';

export interface BrightnessContrastEffect extends RenderEffect {
  kind: 'BrightnessContrastEffect';
  brightness?: number;
  contrast?: number;
}
