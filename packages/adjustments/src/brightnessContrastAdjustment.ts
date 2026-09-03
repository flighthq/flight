import type { NonEntityCreateResult } from '@flighthq/types/contract';
import type { BrightnessContrastAdjustment } from '@flighthq/types/contract';

// Brightness/contrast as a matrix-tier adjustment. Reproduces the prior full-frame shader
// `rgb = (rgb + brightness − 0.5)·contrast + 0.5` (a shift by brightness, then scale about mid-grey 0.5).
// Expanded, that is affine per channel: `rgb·contrast + (brightness·contrast + 0.5·(1 − contrast))`, so the
// matrix is scale `contrast`, normalized bias `brightness·contrast + 0.5·(1 − contrast)`.
// Alpha is unchanged. Identity defaults are brightness 0, contrast 1 (the prior
// `renderEffectDefaults` listed `contrast: 0`, which disagreed with the shader's `contrast ?? 1` identity —
// this corrects it to contrast 1).
export function createBrightnessContrastAdjustment(
  options: Readonly<Omit<BrightnessContrastAdjustment, 'kind' | 'colorMatrix'>> = {},
): NonEntityCreateResult<BrightnessContrastAdjustment, 'descriptor'> {
  const brightness = options.brightness ?? 0;
  const contrast = options.contrast ?? 1;
  const s = contrast;
  const o = brightness * contrast + 0.5 * (1 - contrast);
  // prettier-ignore
  const colorMatrix = [
    s, 0, 0, 0, o,
    0, s, 0, 0, o,
    0, 0, s, 0, o,
    0, 0, 0, 1, 0,
  ];
  return { kind: 'BrightnessContrastAdjustment', ...options, colorMatrix };
}
