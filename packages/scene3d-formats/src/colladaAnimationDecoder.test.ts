import { describe, expect, it } from 'vitest';

import { decodeColladaAnimations } from './colladaAnimationDecoder.ts';

// ★ MOVED, NOT REWRITTEN. These assertions were nested inside `describe('parseCollada')` while the decoder lived
// in the orchestrator. They are byte-identical here — the point of the move is locality, and rewriting them at the
// same time would have made a behaviour change indistinguishable from a relocation.

describe('decodeColladaAnimations', () => {
  it('decodes animation channel targets and interpolation modes', () => {
    const xml =
      '<COLLADA><library_animations><animation><source id="t"><float_array>0 1</float_array></source><source id="o"><float_array>0 2</float_array></source><source id="i"><Name_array>LINEAR STEP</Name_array></source><sampler><input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/><input semantic="INTERPOLATION" source="#i"/></sampler><channel source="#s" target="node/rotate.ANGLE"/></animation></library_animations></COLLADA>';
    const channels = decodeColladaAnimations(xml);
    expect(channels[0]).toMatchObject({
      target: 'node/rotate.ANGLE',
      times: [0, 1],
      values: [0, 2],
      interpolation: ['LINEAR', 'STEP'],
    });
  });
});
