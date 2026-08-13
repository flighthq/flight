import { registerDefaultShapeBoundsCommands } from './registerDefaultShapeBoundsCommands';
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
import { getShapeBoundsCommand, getShapeBoundsCommandRegistryRevision } from './shapeBoundsRegistry';

describe('registerDefaultShapeBoundsCommands', () => {
  it('does nothing on import, then explicitly installs every standard command idempotently', () => {
    const bindings = [
      ['beginTextureFill', defaultShapeBoundsFlush, defaultShapeBoundsFlush],
      ['beginFill', defaultShapeBoundsFlush, defaultShapeBoundsFlush],
      ['beginGradientFill', defaultShapeBoundsFlush, defaultShapeBoundsFlush],
      ['cubicCurveTo', defaultShapeBoundsCubicCurveTo, defaultShapeBoundsCubicCurveTo],
      ['curveTo', defaultShapeBoundsCurveTo, defaultShapeBoundsCurveTo],
      ['drawCircle', defaultShapeBoundsDrawCircle, defaultShapeBoundsDrawCircle],
      ['drawEllipse', defaultShapeBoundsDrawEllipse, defaultShapeBoundsDrawEllipse],
      ['drawPath', defaultShapeBoundsDrawPath, defaultShapeBoundsDrawPath],
      ['drawRectangle', defaultShapeBoundsDrawRectangle, defaultShapeBoundsDrawRectangle],
      ['drawRoundRectangle', defaultShapeBoundsDrawRectangle, defaultShapeBoundsDrawRectangle],
      ['endFill', defaultShapeBoundsFlush, defaultShapeBoundsFlush],
      ['lineTextureStyle', null, null],
      ['lineGradientStyle', null, null],
      ['lineStyle', defaultShapeBoundsFlush, defaultShapeBoundsLineStyle],
      ['lineTo', defaultShapeBoundsLineTo, defaultShapeBoundsLineTo],
      ['moveTo', defaultShapeBoundsMoveTo, defaultShapeBoundsMoveTo],
    ] as const;
    // Importing the module must be side-effect-free: the explicit installer is the only door through
    // which standard bounds commands enter the registry.
    for (const [key] of bindings) expect(getShapeBoundsCommand(key)).toBeNull();

    registerDefaultShapeBoundsCommands();

    for (const [key, fillBounds, strokeBounds] of bindings) {
      expect(getShapeBoundsCommand(key)).toMatchObject({ fillBounds, key, strokeBounds });
    }
    const revision = getShapeBoundsCommandRegistryRevision();

    registerDefaultShapeBoundsCommands();

    expect(getShapeBoundsCommandRegistryRevision()).toBe(revision);
  });
});
