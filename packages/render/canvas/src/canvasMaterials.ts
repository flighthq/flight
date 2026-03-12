import type { CanvasRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function setBlendMode(state: CanvasRenderState, value: BlendMode | null): void {
  // if (overrideBlendMode !== null) value = overrideBlendMode;
  if (value === state.currentBlendMode) return;

  state.currentBlendMode = value;
  const context = state.context;

  switch (value) {
    case BlendMode.Add:
      context.globalCompositeOperation = 'lighter';
      break;
    // case BlendMode.Alpha:
    // 	context.globalCompositeOperation = "";
    case BlendMode.Darken:
      context.globalCompositeOperation = 'darken';
      break;
    case BlendMode.Difference:
      context.globalCompositeOperation = 'difference';
      break;
    // case ERASE:
    //   context.globalCompositeOperation = "";
    case BlendMode.Hardlight:
      context.globalCompositeOperation = 'hard-light';
      break;
    // case INVERT:
    //   context.globalCompositeOperation = "";
    // case LAYER:
    // 	context.globalCompositeOperation = "source-over";
    case BlendMode.Lighten:
      context.globalCompositeOperation = 'lighten';
      break;
    case BlendMode.Multiply:
      context.globalCompositeOperation = 'multiply';
      break;
    case BlendMode.Overlay:
      context.globalCompositeOperation = 'overlay';
      break;
    case BlendMode.Screen:
      context.globalCompositeOperation = 'screen';
      break;
    // case SHADER:
    //   context.globalCompositeOperation = "";
    // case SUBTRACT:
    //   context.globalCompositeOperation = "";
    default:
      context.globalCompositeOperation = 'source-over';
      break;
  }
}
