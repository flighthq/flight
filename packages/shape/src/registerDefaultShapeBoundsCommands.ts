import {
  defaultShapeBoundsCubicCurveTo,
  defaultShapeBoundsCurveTo,
  defaultShapeBoundsDrawCircle,
  defaultShapeBoundsDrawEllipse,
  defaultShapeBoundsDrawPath,
  defaultShapeBoundsDrawRectangle,
  defaultShapeBoundsFlush,
  defaultShapeBoundsLineStyle,
  defaultShapeBoundsLineTo,
  defaultShapeBoundsMoveTo,
} from './shapeBounds';
import { registerShapeBoundsCommand } from './shapeBoundsRegistry';

// Standard Shape geometry is useful before a renderer exists (for example while an SVG importer is
// resolving objectBoundingBox units). Keep installing it explicit: importing @flighthq/shape must not
// mutate process policy, while a renderer or headless consumer can opt into the same neutral answers.
export function registerDefaultShapeBoundsCommands(): void {
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsFlush,
    key: 'beginTextureFill',
    strokeBounds: defaultShapeBoundsFlush,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsFlush,
    key: 'beginFill',
    strokeBounds: defaultShapeBoundsFlush,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsFlush,
    key: 'beginGradientFill',
    strokeBounds: defaultShapeBoundsFlush,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsCubicCurveTo,
    key: 'cubicCurveTo',
    strokeBounds: defaultShapeBoundsCubicCurveTo,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsCurveTo,
    key: 'curveTo',
    strokeBounds: defaultShapeBoundsCurveTo,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawCircle,
    key: 'drawCircle',
    strokeBounds: defaultShapeBoundsDrawCircle,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawEllipse,
    key: 'drawEllipse',
    strokeBounds: defaultShapeBoundsDrawEllipse,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawPath,
    key: 'drawPath',
    strokeBounds: defaultShapeBoundsDrawPath,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawRectangle,
    key: 'drawRectangle',
    strokeBounds: defaultShapeBoundsDrawRectangle,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsDrawRectangle,
    key: 'drawRoundRectangle',
    strokeBounds: defaultShapeBoundsDrawRectangle,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsFlush,
    key: 'endFill',
    strokeBounds: defaultShapeBoundsFlush,
  });
  registerShapeBoundsCommand({ fillBounds: null, key: 'lineTextureStyle', strokeBounds: null });
  registerShapeBoundsCommand({ fillBounds: null, key: 'lineGradientStyle', strokeBounds: null });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsFlush,
    key: 'lineStyle',
    strokeBounds: defaultShapeBoundsLineStyle,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsLineTo,
    key: 'lineTo',
    strokeBounds: defaultShapeBoundsLineTo,
  });
  registerShapeBoundsCommand({
    fillBounds: defaultShapeBoundsMoveTo,
    key: 'moveTo',
    strokeBounds: defaultShapeBoundsMoveTo,
  });
}
