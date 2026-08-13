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

// ★ THIS FILE RUNS ISOLATED — scripts/registryIsolatedTests.ts lists it with reason
// `process-global-registry`, and that routing is LOAD-BEARING. Do not demote it to the shared tier.
// What it guards: importing @flighthq/shape registers NOTHING. That side-effect-free-import property is
// the entire reason `registerDefaultShapeBoundsCommands` exists as an explicit entry point instead of a
// module-scope call, so the pre-install assertion below is the only thing holding that guarantee.
// Why isolation rather than a beforeEach that clears the registry: the registry is process-global, so
// "nothing is registered" is a claim about a PROCESS and can only be asserted in one nobody else has
// touched. Clearing first would change the claim to "nothing is registered after I cleared it" — which
// passes identically in a world where importing this package registered forty commands, and so retires
// the guarantee while turning the suite green. Five sibling files register deliberately and assert
// nothing about emptiness; they are correct in the shared tier and only this file needs its own process.
// The list is keyed by MECHANISM (needs a private module registry), not by cause, so this entry is an
// ordinary member whose reason is not mocking — not an escape from a rule about mocking.
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
