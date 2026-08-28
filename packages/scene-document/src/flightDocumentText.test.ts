import { createTransform3D } from '@flighthq/geometry/contract';
import { createAmbientLight } from '@flighthq/lighting/contract';
import type { FlightDocument } from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import { explainFlightDocumentText, formatFlightDocumentText, parseFlightDocumentText } from './flightDocumentText';
import { parseSceneDocumentYamlSubset } from './sceneDocumentYamlSubset';

describe('explainFlightDocumentText', () => {
  it('names an empty scenes collection independently', () => {
    const explanation = explainFlightDocumentText('flight: 1\ndefaultScene: 0\nscenes:\n');

    expect(explanation).toMatchObject({
      path: 'scenes',
      reason: FlightDocumentRefusalReason.ScenesEmpty,
    });
  });

  it('names an out-of-range default scene without clamping it', () => {
    const explanation = explainFlightDocumentText(
      ['flight: 1', 'defaultScene: 1', 'scenes:', '  - kind: Scene2D', '    scene:', '      kind: DisplayObject'].join(
        '\n',
      ),
    );

    expect(explanation).toMatchObject({
      actual: 1,
      limit: 0,
      path: 'defaultScene',
      reason: FlightDocumentRefusalReason.DefaultSceneOutOfRange,
    });
  });

  it('qualifies a structural refusal with the nonzero scene index', () => {
    const explanation = explainFlightDocumentText(
      [
        'flight: 1',
        'defaultScene: 0',
        'scenes:',
        '  - kind: Scene2D',
        '    scene:',
        '      kind: DisplayObject',
        '  - kind: Scene3D',
        '    scene:',
        '      children:',
        '        - kind: Node3D',
      ].join('\n'),
    );

    expect(explanation).toMatchObject({
      path: 'scenes[1].scene.kind',
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });
  });

  it('preserves a typed YAML-subset refusal with source position', () => {
    const explanation = explainFlightDocumentText('flight: 1\nanchor: &root value\n');

    expect(explanation).toMatchObject({
      reason: FlightDocumentRefusalReason.AnchorUnsupported,
    });
    expect(explanation?.line).toBe(2);
    expect(explanation?.column).toBeGreaterThan(0);
  });
});

describe('formatFlightDocumentText', () => {
  it('emits only the accepted YAML subset and round-trips a mixed-scene container', () => {
    const cameraTransform = createTransform3D();
    cameraTransform.position.z = 8;
    const lightTransform = createTransform3D();
    lightTransform.position.y = 4;
    const document: FlightDocument = {
      defaultScene: 1,
      resources: [{ fields: { source: 'shared image.png' }, key: 'shared', kind: 'Texture' }],
      scenes: [
        {
          backgroundColor: 0x112233ff,
          kind: 'Scene2D',
          scene: {
            children: [
              {
                children: [],
                fields: { metadata: { enabled: true }, tags: ['hud', 'shared'], texture: 'shared' },
                kind: 'Sprite',
              },
            ],
            fields: {},
            kind: 'DisplayObject',
          },
        },
        {
          cameras: [
            {
              far: 1000,
              name: 'main camera',
              near: 0.1,
              projection: { aspect: 16 / 9, fovY: 1, kind: 'perspective' },
              transform: cameraTransform,
            },
          ],
          kind: 'Scene3D',
          lights: [{ descriptor: createAmbientLight({ intensity: 0.4 }), transform: lightTransform }],
          scene: { children: [], fields: {}, kind: 'Node3D' },
        },
      ],
      version: 1,
    };

    const text = formatFlightDocumentText(document);
    expect(parseSceneDocumentYamlSubset(text).ok).toBe(true);
    expect(text).not.toContain('[');
    expect(text).not.toContain('&');

    const reparsed = parseFlightDocumentText(text);
    expect(reparsed).not.toBeNull();
    expect(reparsed?.defaultScene).toBe(1);
    expect(reparsed?.resources).toEqual(document.resources);
    expect(reparsed?.scenes.map((scene) => scene.kind)).toEqual(['Scene2D', 'Scene3D']);
    expect(reparsed?.scenes[0].scene.children[0]?.fields).toEqual(document.scenes[0].scene.children[0]?.fields);
    const scene3D = reparsed?.scenes[1];
    expect(scene3D?.kind).toBe('Scene3D');
    if (scene3D?.kind !== 'Scene3D') throw new Error('expected Scene3D fixture');
    expect(scene3D.cameras[0]?.name).toBe('main camera');
    expect(scene3D.cameras[0]?.transform.position.z).toBe(8);
    expect(scene3D.lights[0]?.descriptor.kind).toBe('AmbientLight');
    expect(Reflect.get(scene3D.lights[0]?.descriptor ?? {}, 'intensity')).toBe(0.4);
  });
});

describe('parseFlightDocumentText', () => {
  it('parses mixed dimensions over one shared resource table', () => {
    const document = parseFlightDocumentText(
      [
        'flight: 1',
        'defaultScene: 1',
        'resources:',
        '  - kind: Texture',
        '    key: shared',
        '    source: shared.png',
        'scenes:',
        '  - kind: Scene2D',
        '    backgroundColor: 287454207',
        '    scene:',
        '      kind: DisplayObject',
        '      children:',
        '        - kind: Sprite',
        '          texture: shared',
        '  - kind: Scene3D',
        '    scene:',
        '      kind: Node3D',
        '      children:',
        '        - kind: Mesh',
        '          texture: shared',
      ].join('\n'),
    );

    expect(document).not.toBeNull();
    expect(document?.defaultScene).toBe(1);
    expect(document?.resources).toEqual([{ fields: { source: 'shared.png' }, key: 'shared', kind: 'Texture' }]);
    expect(document?.scenes.map((scene) => scene.kind)).toEqual(['Scene2D', 'Scene3D']);
    expect(document?.scenes[0].scene.children[0]?.fields['texture']).toBe('shared');
    expect(document?.scenes[1].scene.children[0]?.fields['texture']).toBe('shared');
  });

  it('returns null whenever the explain seam reports a structural refusal', () => {
    const text = [
      'flight: 1',
      'defaultScene: 2',
      'scenes:',
      '  - kind: Scene2D',
      '    scene:',
      '      kind: DisplayObject',
    ].join('\n');

    expect(parseFlightDocumentText(text)).toBeNull();
    expect(explainFlightDocumentText(text)?.reason).toBe(FlightDocumentRefusalReason.DefaultSceneOutOfRange);
  });
});
