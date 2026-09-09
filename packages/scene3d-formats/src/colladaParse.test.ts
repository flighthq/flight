import { packLinearToColor } from '@flighthq/color/contract';
import type { DirectionalLight, PointLight, SpotLight } from '@flighthq/types/contract';
import {
  AmbientLightKind,
  DirectionalLightKind,
  ImportDiagnosticSeverity,
  Node3DKind,
  PointLightKind,
  SpotLightKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { decodeColladaAnimations, decodeColladaControllers, decodeColladaMorphs, parseCollada } from './colladaParse';

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

  it('imports ambient, directional, point, and spot technique_common lights', () => {
    const xml = [
      '<COLLADA>',
      '<library_lights>',
      '<light id="ambient" name="Fill"><technique_common><ambient><color>0.25 0.5 0.75</color></ambient></technique_common></light>',
      '<light id="directional" name="Sun"><technique_common><directional><color>2 1 0.5</color></directional></technique_common></light>',
      '<light id="point" name="Bulb"><technique_common><point><color>1 1 1</color><constant_attenuation>0</constant_attenuation><quadratic_attenuation>0.25</quadratic_attenuation></point></technique_common></light>',
      '<light id="spot" name="Stage"><technique_common><spot><color>1 1 1</color><constant_attenuation>0</constant_attenuation><linear_attenuation>0.5</linear_attenuation><falloff_angle>60</falloff_angle><falloff_exponent>3</falloff_exponent></spot></technique_common></light>',
      '</library_lights>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node><instance_light url="#ambient"/></node>',
      '<node><instance_light url="#directional"/></node>',
      '<node><instance_light url="#point"/></node>',
      '<node><instance_light url="#spot"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document, diagnostics } = parseCollada(xml);
    expect(diagnostics).toEqual([]);
    expect(document.lights).toHaveLength(4);

    expect(document.lights[0]).toMatchObject({ name: 'Fill', node: 0 });
    expect(document.lights[0].descriptor).toMatchObject({
      color: packLinearToColor([0.25, 0.5, 0.75, 1]),
      intensity: 1,
      kind: AmbientLightKind,
    });

    const directional = document.lights[1].descriptor as DirectionalLight;
    expect(document.lights[1]).toMatchObject({ name: 'Sun', node: 1 });
    expect(directional).toMatchObject({
      color: packLinearToColor([1, 0.5, 0.25, 1]),
      direction: { x: 0, y: 0, z: -1 },
      intensity: 2,
      kind: DirectionalLightKind,
    });

    const point = document.lights[2].descriptor as PointLight;
    expect(document.lights[2]).toMatchObject({ name: 'Bulb', node: 2 });
    expect(point).toMatchObject({ decay: 2, intensity: 4, kind: PointLightKind, range: -1 });
    expect(point.position).toMatchObject({ x: 0, y: 0, z: 0 });

    const spot = document.lights[3].descriptor as SpotLight;
    expect(document.lights[3]).toMatchObject({ name: 'Stage', node: 3 });
    expect(spot).toMatchObject({
      decay: 1,
      direction: { x: 0, y: 0, z: -1 },
      innerConeCos: 1,
      intensity: 2,
      kind: SpotLightKind,
      range: -1,
      spotBlend: 0.75,
    });
    expect(spot.outerConeCos).toBeCloseTo(Math.cos(Math.PI / 6));
  });

  it('binds each instance_light to its hierarchy node after root-axis conversion', () => {
    const xml = [
      '<COLLADA>',
      '<asset><up_axis>Z_UP</up_axis></asset>',
      '<library_lights><light id="lamp"><technique_common><point><color>1 1 1</color></point></technique_common></light></library_lights>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="parent"><translate>0 2 3</translate><instance_light url="#lamp"/>',
      '<node id="child"><translate>4 5 6</translate><instance_light url="#lamp"/></node>',
      '</node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.nodes[0].children).toEqual([1]);
    expect(document.lights.map((light) => light.node)).toEqual([0, 1]);
    expect(document.lights[0].transform.position).toMatchObject({ x: 0, y: 3, z: -2 });
    expect(document.lights[1].transform.position).toMatchObject({ x: 4, y: 9, z: -7 });
    expect(document.lights[0].descriptor).not.toBe(document.lights[1].descriptor);
    expect(document.lights[0].transform).not.toBe(document.nodes[0].transform);
    expect((document.lights[0].descriptor as PointLight).decay).toBe(0);
  });

  it('approximates mixed COLLADA attenuation at unit distance', () => {
    const xml = [
      '<COLLADA>',
      '<library_lights><light id="mixed"><technique_common><point><color>1 1 1</color><constant_attenuation>1</constant_attenuation><linear_attenuation>2</linear_attenuation><quadratic_attenuation>1</quadratic_attenuation></point></technique_common></light></library_lights>',
      '<library_visual_scenes><visual_scene id="vs"><node><instance_light url="#mixed"/></node></visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document, diagnostics } = parseCollada(xml);
    expect(document.lights[0].descriptor).toMatchObject({ decay: 1, intensity: 0.25 });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        detail: { constant: 1, light: 'mixed', linear: 2, quadratic: 1 },
        kind: 'collada.light-attenuation-approximated',
        severity: ImportDiagnosticSeverity.Recover,
      }),
    ]);
  });

  it('diagnoses malformed light definitions and missing instance_light references', () => {
    const xml = [
      '<COLLADA>',
      '<library_lights>',
      '<light><technique_common><ambient><color>1 1 1</color></ambient></technique_common></light>',
      '<light id="bad-color"><technique_common><ambient><color>red 1 1</color></ambient></technique_common></light>',
      '<light id="bad-attenuation"><technique_common><point><color>1 1 1</color><quadratic_attenuation>-1</quadratic_attenuation></point></technique_common></light>',
      '<light id="bad-falloff"><technique_common><spot><color>1 1 1</color><falloff_exponent>NaN</falloff_exponent></spot></technique_common></light>',
      '<light id="bad-type"><technique_common><ambient><color>1 1 1</color></ambient><point><color>1 1 1</color></point></technique_common></light>',
      '</library_lights>',
      '<library_visual_scenes><visual_scene id="vs"><node>',
      '<instance_light/><instance_light url="#bad-color"/><instance_light url="#missing"/><instance_light url="other.dae#lamp"/>',
      '</node></visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document, diagnostics } = parseCollada(xml);
    expect(document.lights).toEqual([]);
    expect(
      diagnostics.filter((diagnostic) => diagnostic.kind === 'collada.light-malformed').map((entry) => entry.detail),
    ).toEqual([
      { field: 'id', light: '(missing)' },
      { field: 'color', light: 'bad-color' },
      { field: 'quadratic_attenuation', light: 'bad-attenuation' },
      { field: 'falloff_exponent', light: 'bad-falloff' },
      { field: 'type', light: 'bad-type' },
    ]);
    expect(diagnostics.filter((diagnostic) => diagnostic.kind === 'collada.missing-reference')).toHaveLength(3);
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

  it('imports and binds a perspective camera', () => {
    const xml = [
      '<COLLADA>',
      '<library_cameras><camera id="view" name="Main View"><optics><technique_common><perspective>',
      '<yfov>45</yfov><aspect_ratio>1.5</aspect_ratio><znear>0.25</znear><zfar>400</zfar>',
      '</perspective></technique_common></optics></camera></library_cameras>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="camera-node"><translate>1 2 3</translate><instance_camera url="#view"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { diagnostics, document } = parseCollada(xml);
    expect(diagnostics).toEqual([]);
    expect(document.cameras).toHaveLength(1);
    expect(document.cameras[0]).toMatchObject({ far: 400, name: 'Main View', near: 0.25, node: 0 });
    expect(document.cameras[0].projection).toMatchObject({ aspect: 1.5, kind: 'perspective' });
    if (document.cameras[0].projection.kind === 'perspective') {
      near(document.cameras[0].projection.fovY, Math.PI / 4);
    }
    expect(document.cameras[0].transform.position).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('imports and binds an orthographic camera', () => {
    const xml = [
      '<COLLADA>',
      '<library_cameras><camera id="view"><optics><technique_common><orthographic>',
      '<xmag>8</xmag><ymag>6</ymag><znear>0</znear><zfar>50</zfar>',
      '</orthographic></technique_common></optics></camera></library_cameras>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="camera-node"><instance_camera url="#view"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { diagnostics, document } = parseCollada(xml);
    expect(diagnostics).toEqual([]);
    expect(document.cameras).toHaveLength(1);
    expect(document.cameras[0]).toMatchObject({
      far: 50,
      near: 0,
      node: 0,
      projection: { halfHeight: 6, halfWidth: 8, kind: 'orthographic' },
    });
  });

  it('reports a dropped instance_camera with a missing definition', () => {
    const xml = [
      '<COLLADA>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="camera-node"><instance_camera url="#missing"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { diagnostics, document } = parseCollada(xml);
    expect(document.cameras).toEqual([]);
    expect(diagnostics).toContainEqual({
      detail: { element: 'instance_camera', url: '#missing' },
      kind: 'collada.missing-reference',
      origin: 'parseCollada',
      severity: ImportDiagnosticSeverity.Drop,
    });
  });

  it('composes the camera transform through its visual-scene hierarchy', () => {
    const xml = [
      '<COLLADA>',
      '<library_cameras><camera id="view"><optics><technique_common><perspective>',
      '<yfov>50</yfov><znear>0.5</znear><zfar>500</zfar>',
      '</perspective></technique_common></optics></camera></library_cameras>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="parent"><translate>2 3 4</translate>',
      '<node id="camera-node"><translate>5 6 7</translate><instance_camera url="#view"/></node>',
      '</node></visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { diagnostics, document } = parseCollada(xml);
    expect(diagnostics).toEqual([]);
    expect(document.nodes[0].children).toEqual([1]);
    expect(document.cameras[0].node).toBe(1);
    expect(document.cameras[0].transform.position).toMatchObject({ x: 7, y: 9, z: 11 });
  });

  it('recovers incomplete perspective definitions with documented defaults', () => {
    const xml = [
      '<COLLADA>',
      '<library_cameras><camera id="view"><optics><technique_common><perspective>',
      '<znear>0.5</znear>',
      '</perspective></technique_common></optics></camera></library_cameras>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="camera-node"><instance_camera url="#view"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { diagnostics, document } = parseCollada(xml);
    expect(document.cameras[0]).toMatchObject({
      far: 1000,
      near: 0.5,
      projection: { aspect: 1, kind: 'perspective' },
    });
    if (document.cameras[0].projection.kind === 'perspective') {
      near(document.cameras[0].projection.fovY, Math.PI / 3);
    }
    expect(diagnostics).toContainEqual({
      detail: { camera: 'view', fields: 'yfov,zfar', projection: 'perspective' },
      kind: 'collada.camera-incomplete',
      origin: 'parseCollada',
      severity: ImportDiagnosticSeverity.Recover,
    });
  });

  it('binds instance_geometry to a mesh', () => {
    const xml = [
      '<COLLADA>',
      '<library_geometries><geometry id="g"><mesh>',
      '<source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source>',
      '<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>',
      '<triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>',
      '</mesh></geometry></library_geometries>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n" name="MeshNode"><instance_geometry url="#g"/></node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.meshes).toHaveLength(1);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].mesh).toBe(0);
  });

  it('resolves instance_controller to a skin with node-index joints and column-major inverse binds', () => {
    const xml = [
      '<COLLADA>',
      '<library_geometries><geometry id="g"><mesh>',
      '<source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source>',
      '<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>',
      '<triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>',
      '</mesh></geometry></library_geometries>',
      '<library_controllers><controller id="skin1"><skin source="#g">',
      '<bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix>',
      '<source id="jn"><Name_array>Root Arm</Name_array></source>',
      '<source id="wt"><float_array>1 0.5</float_array></source>',
      '<source id="ibm"><float_array>',
      '1 0 0 0  0 1 0 0  0 0 1 0  0 0 0 1 ',
      '1 0 0 2  0 1 0 0  0 0 1 0  0 0 0 1',
      '</float_array></source>',
      '<joints><input semantic="JOINT" source="#jn"/><input semantic="INV_BIND_MATRIX" source="#ibm"/></joints>',
      '<vertex_weights count="1">',
      '<input semantic="JOINT" source="#jn" offset="0"/>',
      '<input semantic="WEIGHT" source="#wt" offset="1"/>',
      '<vcount>1</vcount><v>0 0</v>',
      '</vertex_weights>',
      '</skin></controller></library_controllers>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="Root" name="Root">',
      '<node id="Arm" name="Arm"/>',
      '</node>',
      '<node id="MeshNode" name="MeshNode">',
      '<instance_controller url="#skin1"><skeleton>#Root</skeleton></instance_controller>',
      '</node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document, diagnostics } = parseCollada(xml);
    expect(diagnostics.filter((d) => d.severity === 'Reject' || d.severity === 'Drop')).toHaveLength(0);

    expect(document.nodes).toHaveLength(3);
    expect(document.nodes[0].name).toBe('Root');
    expect(document.nodes[1].name).toBe('Arm');
    expect(document.nodes[2].name).toBe('MeshNode');
    expect(document.nodes[2].mesh).toBe(0);

    expect(document.skins).toHaveLength(1);
    const skin = document.skins[0];
    expect(skin.joints).toEqual([0, 1]);
    expect(skin.inverseBind).toHaveLength(2);
    // First joint: identity
    expect(skin.inverseBind[0].m[0]).toBe(1);
    expect(skin.inverseBind[0].m[5]).toBe(1);
    expect(skin.inverseBind[0].m[10]).toBe(1);
    expect(skin.inverseBind[0].m[15]).toBe(1);
    // Second joint: row-major [1,0,0,2 ...] → column-major m[12]=2 (translation X)
    expect(skin.inverseBind[1].m[12]).toBe(2);

    expect(document.meshes[0].skin).toBe(0);
  });

  it('resolves translate animation channel to Translation track', () => {
    const xml = [
      '<COLLADA>',
      '<library_animations><animation>',
      '<source id="t"><float_array>0 0.5 1</float_array></source>',
      '<source id="o"><float_array>0 0 0  1 2 3  2 4 6</float_array></source>',
      '<source id="i"><Name_array>LINEAR LINEAR LINEAR</Name_array></source>',
      '<sampler id="s">',
      '<input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/>',
      '<input semantic="INTERPOLATION" source="#i"/>',
      '</sampler>',
      '<channel source="#s" target="Bone/translate"/>',
      '</animation></library_animations>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="Bone" name="Bone"/>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.animations).toHaveLength(1);
    const anim = document.animations[0];
    expect(anim.duration).toBe(1);
    expect(anim.channels).toHaveLength(1);
    const ch = anim.channels[0];
    expect(ch.node).toBe(0);
    expect(ch.path).toBe('Translation');
    expect(ch.track.interpolation).toBe('Linear');
    expect(ch.track.components).toBe(3);
    expect(Array.from(ch.track.times)).toEqual([0, 0.5, 1]);
    expect(Array.from(ch.track.values)).toEqual([0, 0, 0, 1, 2, 3, 2, 4, 6]);
  });

  it('resolves rotateY.ANGLE animation to quaternion Rotation track', () => {
    const xml = [
      '<COLLADA>',
      '<library_animations><animation>',
      '<source id="t"><float_array>0 1</float_array></source>',
      '<source id="o"><float_array>0 90</float_array></source>',
      '<source id="i"><Name_array>LINEAR LINEAR</Name_array></source>',
      '<sampler id="s">',
      '<input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/>',
      '<input semantic="INTERPOLATION" source="#i"/>',
      '</sampler>',
      '<channel source="#s" target="Joint/rotateY.ANGLE"/>',
      '</animation></library_animations>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="Joint" name="Joint"/>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.animations).toHaveLength(1);
    const ch = document.animations[0].channels[0];
    expect(ch.path).toBe('Rotation');
    expect(ch.track.quaternion).toBe(true);
    expect(ch.track.components).toBe(4);
    // Keyframe 0: 0 degrees → identity quaternion (0,0,0,1)
    near(ch.track.values[0], 0);
    near(ch.track.values[1], 0);
    near(ch.track.values[2], 0);
    near(ch.track.values[3], 1);
    // Keyframe 1: 90 degrees about Y → (0, sin(45°), 0, cos(45°))
    near(ch.track.values[4], 0);
    near(ch.track.values[5], Math.sin(Math.PI / 4));
    near(ch.track.values[6], 0);
    near(ch.track.values[7], Math.cos(Math.PI / 4));
  });

  it('resolves matrix animation to decomposed TRS channels', () => {
    const xml = [
      '<COLLADA>',
      '<library_animations><animation>',
      '<source id="t"><float_array>0 1</float_array></source>',
      '<source id="o"><float_array>',
      '1 0 0 0  0 1 0 0  0 0 1 0  0 0 0 1 ',
      '1 0 0 5  0 1 0 0  0 0 1 0  0 0 0 1',
      '</float_array></source>',
      '<source id="i"><Name_array>LINEAR LINEAR</Name_array></source>',
      '<sampler id="s">',
      '<input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/>',
      '<input semantic="INTERPOLATION" source="#i"/>',
      '</sampler>',
      '<channel source="#s" target="Box/matrix"/>',
      '</animation></library_animations>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="Box" name="Box"/>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.animations).toHaveLength(1);
    const anim = document.animations[0];
    expect(anim.channels).toHaveLength(3);
    const paths = anim.channels.map((c) => c.path).sort();
    expect(paths).toEqual(['Rotation', 'Scale', 'Translation']);
    const tCh = anim.channels.find((c) => c.path === 'Translation')!;
    expect(tCh.track.components).toBe(3);
    // Keyframe 0: identity → translation (0,0,0)
    near(tCh.track.values[0], 0);
    near(tCh.track.values[1], 0);
    near(tCh.track.values[2], 0);
    // Keyframe 1: row-major [1,0,0,5 ...] → translation (5,0,0)
    near(tCh.track.values[3], 5);
    near(tCh.track.values[4], 0);
    near(tCh.track.values[5], 0);
  });

  it('maps STEP interpolation to Step', () => {
    const xml = [
      '<COLLADA>',
      '<library_animations><animation>',
      '<source id="t"><float_array>0 1</float_array></source>',
      '<source id="o"><float_array>0 0 0 1 1 1</float_array></source>',
      '<source id="i"><Name_array>STEP STEP</Name_array></source>',
      '<sampler id="s">',
      '<input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/>',
      '<input semantic="INTERPOLATION" source="#i"/>',
      '</sampler>',
      '<channel source="#s" target="N/scale"/>',
      '</animation></library_animations>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="N" name="N"/>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.animations[0].channels[0].track.interpolation).toBe('Step');
  });

  it('diagnoses unsupported animation target properties', () => {
    const xml = [
      '<COLLADA>',
      '<library_animations><animation>',
      '<source id="t"><float_array>0 1</float_array></source>',
      '<source id="o"><float_array>0 1</float_array></source>',
      '<source id="i"><Name_array>LINEAR LINEAR</Name_array></source>',
      '<sampler id="s">',
      '<input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/>',
      '<input semantic="INTERPOLATION" source="#i"/>',
      '</sampler>',
      '<channel source="#s" target="N/visibility"/>',
      '</animation></library_animations>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="N" name="N"/>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document, diagnostics } = parseCollada(xml);
    expect(document.animations).toHaveLength(0);
    expect(diagnostics.some((d) => d.kind === 'collada.unsupported-animation-target')).toBe(true);
  });

  it('applies bind_material overrides on instance_geometry', () => {
    const xml = [
      '<COLLADA>',
      '<library_images><image id="tex"><init_from>tex.png</init_from></image></library_images>',
      '<library_effects><effect id="fx"><profile_COMMON>',
      '<newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam>',
      '<newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>',
      '<technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique>',
      '</profile_COMMON></effect></library_effects>',
      '<library_materials><material id="MatA"><instance_effect url="#fx"/></material></library_materials>',
      '<library_geometries><geometry id="g"><mesh>',
      '<source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source>',
      '<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>',
      '<triangles count="1" material="DefaultSymbol"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>',
      '</mesh></geometry></library_geometries>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n" name="N">',
      '<instance_geometry url="#g">',
      '<bind_material><technique_common>',
      '<instance_material symbol="DefaultSymbol" target="#MatA"/>',
      '</technique_common></bind_material>',
      '</instance_geometry>',
      '</node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.meshes).toHaveLength(1);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.meshes[0].materials).toEqual([0]);
  });

  it('applies bind_material overrides on instance_controller', () => {
    const xml = [
      '<COLLADA>',
      '<library_images><image id="tex"><init_from>tex.png</init_from></image></library_images>',
      '<library_effects><effect id="fx"><profile_COMMON>',
      '<newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam>',
      '<newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>',
      '<technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique>',
      '</profile_COMMON></effect></library_effects>',
      '<library_materials><material id="MatB"><instance_effect url="#fx"/></material></library_materials>',
      '<library_geometries><geometry id="g"><mesh>',
      '<source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source>',
      '<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>',
      '<triangles count="1" material="SkinSymbol"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>',
      '</mesh></geometry></library_geometries>',
      '<library_controllers><controller id="skin1"><skin source="#g">',
      '<bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix>',
      '<source id="jn"><Name_array>Bone</Name_array></source>',
      '<source id="wt"><float_array>1</float_array></source>',
      '<source id="ibm"><float_array>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</float_array></source>',
      '<joints><input semantic="JOINT" source="#jn"/><input semantic="INV_BIND_MATRIX" source="#ibm"/></joints>',
      '<vertex_weights count="1"><input semantic="JOINT" source="#jn" offset="0"/>',
      '<input semantic="WEIGHT" source="#wt" offset="1"/>',
      '<vcount>1</vcount><v>0 0</v></vertex_weights>',
      '</skin></controller></library_controllers>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="Bone" name="Bone"/>',
      '<node id="MeshNode" name="MeshNode">',
      '<instance_controller url="#skin1"><skeleton>#Bone</skeleton>',
      '<bind_material><technique_common>',
      '<instance_material symbol="SkinSymbol" target="#MatB"/>',
      '</technique_common></bind_material>',
      '</instance_controller>',
      '</node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.meshes).toHaveLength(1);
    expect(document.nodes[1].mesh).toBe(0);
    expect(document.meshes[0].materials).toEqual([0]);
    expect(document.skins).toHaveLength(1);
    expect(document.meshes[0].skin).toBe(0);
  });

  it('clones mesh when two instances bind different materials to the same geometry', () => {
    const xml = [
      '<COLLADA>',
      '<library_images><image id="tex"><init_from>tex.png</init_from></image></library_images>',
      '<library_effects>',
      '<effect id="fxA"><profile_COMMON><newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique></profile_COMMON></effect>',
      '<effect id="fxB"><profile_COMMON><newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique></profile_COMMON></effect>',
      '</library_effects>',
      '<library_materials>',
      '<material id="MatA"><instance_effect url="#fxA"/></material>',
      '<material id="MatB"><instance_effect url="#fxB"/></material>',
      '</library_materials>',
      '<library_geometries><geometry id="g"><mesh>',
      '<source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source>',
      '<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>',
      '<triangles count="1" material="Sym"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles>',
      '</mesh></geometry></library_geometries>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="n1" name="First">',
      '<instance_geometry url="#g"><bind_material><technique_common>',
      '<instance_material symbol="Sym" target="#MatA"/>',
      '</technique_common></bind_material></instance_geometry>',
      '</node>',
      '<node id="n2" name="Second">',
      '<instance_geometry url="#g"><bind_material><technique_common>',
      '<instance_material symbol="Sym" target="#MatB"/>',
      '</technique_common></bind_material></instance_geometry>',
      '</node>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document } = parseCollada(xml);
    expect(document.meshes).toHaveLength(2);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.nodes[1].mesh).toBe(1);
    expect(document.meshes[0].materials).toEqual([0]);
    expect(document.meshes[1].materials).toEqual([1]);
    expect(document.meshes[0].geometry).toBe(document.meshes[1].geometry);
  });

  it('diagnoses unresolvable animation target nodes', () => {
    const xml = [
      '<COLLADA>',
      '<library_animations><animation>',
      '<source id="t"><float_array>0 1</float_array></source>',
      '<source id="o"><float_array>0 0 0 1 1 1</float_array></source>',
      '<source id="i"><Name_array>LINEAR LINEAR</Name_array></source>',
      '<sampler id="s">',
      '<input semantic="INPUT" source="#t"/><input semantic="OUTPUT" source="#o"/>',
      '<input semantic="INTERPOLATION" source="#i"/>',
      '</sampler>',
      '<channel source="#s" target="Ghost/translate"/>',
      '</animation></library_animations>',
      '<library_visual_scenes><visual_scene id="vs">',
      '<node id="N" name="N"/>',
      '</visual_scene></library_visual_scenes>',
      '<scene><instance_visual_scene url="#vs"/></scene>',
      '</COLLADA>',
    ].join('');
    const { document, diagnostics } = parseCollada(xml);
    expect(document.animations).toHaveLength(0);
    expect(diagnostics.some((d) => d.kind === 'collada.animation-target-unresolved')).toBe(true);
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
});
