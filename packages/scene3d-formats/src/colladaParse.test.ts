import { ImportDiagnosticSeverity, Node3DKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { decodeColladaAnimations, decodeColladaControllers, parseCollada } from './colladaParse';

function near(a: number, b: number, eps = 1e-5): void {
  expect(a).toBeCloseTo(b, -Math.log10(eps));
}

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

  it('builds a flat node list from visual_scene', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs" name="Scene">',
      '<node id="A" name="NodeA"/>',
      '<node id="B" name="NodeB"/>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.scenes).toHaveLength(1);
    expect(document.scenes[0].name).toBe('Scene');
    expect(document.scenes[0].rootNodes).toEqual([0, 1]);
    expect(document.nodes).toHaveLength(2);
    expect(document.nodes[0].name).toBe('NodeA');
    expect(document.nodes[0].kind).toBe(Node3DKind);
    expect(document.nodes[1].name).toBe('NodeB');
  });

  it('builds nested node hierarchy with children indices', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="P" name="Parent">',
      '<node id="C1" name="Child1"/>',
      '<node id="C2" name="Child2"><node id="G" name="Grandchild"/></node>',
      '</node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.scenes[0].rootNodes).toEqual([0]);
    expect(document.nodes).toHaveLength(4);
    expect(document.nodes[0].name).toBe('Parent');
    expect(document.nodes[0].children).toEqual([1, 2]);
    expect(document.nodes[1].name).toBe('Child1');
    expect(document.nodes[1].children).toEqual([]);
    expect(document.nodes[2].name).toBe('Child2');
    expect(document.nodes[2].children).toEqual([3]);
    expect(document.nodes[3].name).toBe('Grandchild');
  });

  it('decomposes a COLLADA row-major matrix into Transform3D', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n"><matrix>1 0 0 3  0 1 0 4  0 0 1 5  0 0 0 1</matrix></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    const t = document.nodes[0].transform;
    near(t.position.x, 3);
    near(t.position.y, 4);
    near(t.position.z, 5);
    near(t.scale.x, 1);
    near(t.scale.y, 1);
    near(t.scale.z, 1);
  });

  it('applies translate transform elements', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n"><translate>7 -2 5</translate></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    const t = document.nodes[0].transform;
    near(t.position.x, 7);
    near(t.position.y, -2);
    near(t.position.z, 5);
  });

  it('applies rotate transform elements with degrees-to-radians conversion', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n"><rotate>0 1 0 90</rotate></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    const q = document.nodes[0].transform.rotation;
    near(q.x, 0);
    near(Math.abs(q.y), Math.sin(Math.PI / 4));
    near(q.z, 0);
    near(q.w, Math.cos(Math.PI / 4));
  });

  it('applies scale transform elements', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n"><scale>2 3 4</scale></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    const t = document.nodes[0].transform;
    near(t.scale.x, 2);
    near(t.scale.y, 3);
    near(t.scale.z, 4);
  });

  it('composes multiple transform elements left-to-right', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n"><translate>1 2 3</translate><scale>2 2 2</scale></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    const t = document.nodes[0].transform;
    near(t.position.x, 1);
    near(t.position.y, 2);
    near(t.position.z, 3);
    near(t.scale.x, 2);
    near(t.scale.y, 2);
    near(t.scale.z, 2);
  });

  it('applies lookat as a placement matrix', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n"><lookat>0 0 10  0 0 0  0 1 0</lookat></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    const t = document.nodes[0].transform;
    near(t.position.x, 0);
    near(t.position.y, 0);
    near(t.position.z, 10);
  });

  it('resolves instance_node from library_nodes', () => {
    const xml = [
      '<COLLADA>',
      '<library_nodes><node id="shared" name="Shared"><translate>1 0 0</translate></node></library_nodes>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="host" name="Host"><instance_node url="#shared"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.nodes).toHaveLength(2);
    expect(document.nodes[0].name).toBe('Host');
    expect(document.nodes[0].children).toEqual([1]);
    expect(document.nodes[1].name).toBe('Shared');
    near(document.nodes[1].transform.position.x, 1);
  });

  it('detects instance_node cycles and reports diagnostic', () => {
    const xml = [
      '<COLLADA>',
      '<library_nodes><node id="loop" name="Loop"><instance_node url="#loop"/></node></library_nodes>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="root" name="Root"><instance_node url="#loop"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document, diagnostics } = parseCollada(xml);
    expect(document.nodes).toHaveLength(2);
    const cycleDiag = diagnostics.find((d) => d.kind === 'collada.instance-cycle');
    expect(cycleDiag).toBeDefined();
  });

  it('applies Z_UP root transform to root nodes', () => {
    const xml = [
      '<COLLADA>',
      '<asset><up_axis>Z_UP</up_axis></asset>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n"><translate>0 0 5</translate></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    const t = document.nodes[0].transform;
    near(t.position.x, 0);
    near(t.position.y, 5);
    near(t.position.z, 0);
  });

  it('reports missing instance_visual_scene reference', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs"/></library_visual_scenes>',
      '<scene><instance_visual_scene url="#nonexistent"/></scene>',
      '</COLLADA>',
    ].join('');
    const { diagnostics } = parseCollada(xml);
    expect(diagnostics.some((d) => d.kind === 'collada.missing-reference')).toBe(true);
  });

  it('produces no scene when scene element is absent', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs"><node id="n"/></visual_scene></library_visual_scenes>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.scenes).toHaveLength(0);
    expect(document.nodes).toHaveLength(0);
  });
});
