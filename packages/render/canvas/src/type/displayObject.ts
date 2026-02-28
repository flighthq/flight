import { rectangle } from '@flighthq/geometry';
import { calculateBoundsRect } from '@flighthq/scene-graph-stage';
import type { CanvasRendererState, RenderableData } from '@flighthq/types';

import { setBlendMode } from '../materials';
import { setTransform } from '../transform';

export function renderOpaqueBackground(state: CanvasRendererState, displayObject: RenderableData): void {
  const opaqueBackground = displayObject.source.opaqueBackground;
  if (opaqueBackground === null) return;

  setBlendMode(state, displayObject.blendMode);

  const context = state.context;

  setTransform(state, context, displayObject.transform);

  const r = (opaqueBackground >> 16) & 0xff;
  const g = (opaqueBackground >> 8) & 0xff;
  const b = opaqueBackground & 0xff;
  context.fillStyle = `rgb(${r},${g},${b})`;

  // getLocalBoundsRect does not include children
  calculateBoundsRect(tempBounds, displayObject.source, displayObject.source);
  context.fillRect(0, 0, tempBounds.width, tempBounds.height);
}

const tempBounds = rectangle.create();
