import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { decodeColladaControllers, parseCollada } from './colladaParse';

describe('parseCollada', () => {
  it('reads asset metadata and preserves Y-up identity', () => {
    const result = parseCollada(
      '<COLLADA version="1.4.1"><asset><contributor><authoring_tool>Tool</authoring_tool></contributor><copyright>Me</copyright><up_axis>Y_UP</up_axis></asset></COLLADA>',
    );
    expect(result.document.metadata).toEqual({ copyright: 'Me', generator: 'Tool', version: '1.4.1' });
    expect(result.upAxis).toBe('Y_UP');
    expect(result.rootTransform).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
  it('returns converted materials and external resources from the public parser', () => {
    const result = parseCollada(
      '<COLLADA><library_images><image id="albedo"><init_from>albedo.png</init_from></image></library_images><library_effects><effect id="fx"><profile_COMMON><newparam sid="surface"><surface><init_from>albedo</init_from></surface></newparam><newparam sid="sampler"><sampler2D><source>surface</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="sampler"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials></COLLADA>',
      { baseUrl: '/models' },
    );
    expect(result.document.materials).toHaveLength(1);
    expect(result.document.resources).toHaveLength(1);
    expect(result.document.resources[0]).toMatchObject({ basePath: '/models', uri: 'albedo.png' });
  });
  it('reports coordinate conversion and unsupported profiles', () => {
    const result = parseCollada(
      '<COLLADA><asset><up_axis>Z_UP</up_axis></asset><library_effects><effect id="custom"><profile_GLSL/></effect></library_effects></COLLADA>',
    );
    expect(result.diagnostics.map((d) => [d.kind, d.severity])).toEqual([
      ['collada.coordinate-conversion', ImportDiagnosticSeverity.Recover],
      ['collada.unsupported-profile', ImportDiagnosticSeverity.Skip],
    ]);
    expect(result.rootTransform[6]).toBe(-1);
  });
  it('rejects invalid XML documents and reports missing instance references', () => {
    expect(parseCollada('<not-collada/>').diagnostics[0].kind).toBe('collada.invalid-document');
    const result = parseCollada('<COLLADA><instance_geometry/></COLLADA>');
    expect(result.diagnostics[0].kind).toBe('collada.missing-reference');
  });
  it('decodes a position source and triangle indices into Flight geometry', () => {
    const xml =
      '<COLLADA><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries></COLLADA>';
    const result = parseCollada(xml);
    expect(result.document.meshes).toHaveLength(1);
    expect(Array.from(result.document.meshes[0].geometry.indices ?? [])).toEqual([0, 1, 2]);
    const vertices = result.document.meshes[0].geometry.vertices;
    expect([
      vertices[0],
      vertices[1],
      vertices[2],
      vertices[12],
      vertices[13],
      vertices[14],
      vertices[24],
      vertices[25],
      vertices[26],
    ]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  });
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
});
