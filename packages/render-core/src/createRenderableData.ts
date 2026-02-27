import { matrix3x2 } from '@flighthq/geom';
import { colorTransform } from '@flighthq/materials';
import type { Renderable, RenderableData } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function createRenderableData(source: Renderable): RenderableData {
  return {
    alpha: 1,
    appearanceFrameID: -1,
    blendMode: BlendMode.Normal,
    cacheAsBitmap: false,
    clipRect: null,
    colorTransform: colorTransform.create(),
    lastAppearanceID: -1,
    lastLocalTransformID: -1,
    mask: null,
    maskFrameID: -1,
    shader: null,
    source: source,
    transform: matrix3x2.create(),
    transformFrameID: -1,
    useColorTransform: false,
    visible: true,
  };
}
