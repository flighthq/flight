import { describe, expect, it } from 'vitest';

import { decodeColladaControllers, decodeColladaMorphs } from './colladaControllerDecoder.ts';

// ★ MOVED, NOT REWRITTEN. These assertions were nested inside `describe('parseCollada')` while the decoder lived
// in the orchestrator. They are byte-identical here — the point of the move is locality, and rewriting them at the
// same time would have made a behaviour change indistinguishable from a relocation.

describe('decodeColladaControllers', () => {
  it('decodes skin joint names, inverse binds, and normalized vertex weights', () => {
    const xml =
      '<COLLADA><library_controllers><controller id="c"><skin source="#g"><bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix><source id="j"><Name_array>root child</Name_array></source><source id="w"><float_array>1 3</float_array></source><joints><input semantic="JOINT" source="#j"/><input semantic="INV_BIND_MATRIX" source="#m"/></joints><source id="m"><float_array>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</float_array></source><vertex_weights count="1"><input semantic="JOINT" source="#j" offset="0"/><input semantic="WEIGHT" source="#w" offset="1"/><vcount>2</vcount><v>0 0 1 1</v></vertex_weights></skin></controller></library_controllers></COLLADA>';
    const skins = decodeColladaControllers(xml);
    expect(skins[0].controllerId).toBe('c');
    expect(skins[0].jointNames).toEqual(['root', 'child']);
    expect(skins[0].influences[0].map((x) => x.weight)).toEqual([0.25, 0.75]);
  });
});

describe('decodeColladaMorphs', () => {
  it('decodes morph target IDs, weights, and method', () => {
    const xml =
      '<COLLADA><library_controllers><controller id="m"><morph source="#base" method="NORMALIZED"><source id="t"><IDREF_array>shapeA shapeB</IDREF_array></source><source id="w"><float_array>0.2 0.8</float_array></source><targets><input semantic="MORPH_TARGET" source="#t"/><input semantic="MORPH_WEIGHT" source="#w"/></targets></morph></controller></library_controllers></COLLADA>';
    expect(decodeColladaMorphs(xml)[0]).toEqual({
      controllerId: 'm',
      baseGeometry: 'base',
      method: 'NORMALIZED',
      targets: ['shapeA', 'shapeB'],
      weights: [0.2, 0.8],
    });
  });
});
