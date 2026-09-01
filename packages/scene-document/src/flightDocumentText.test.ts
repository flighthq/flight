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

  it('names an invalid token key against the scene that declares it', () => {
    const explanation = explainFlightDocumentText(
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
        '  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n' +
        '    tokens:\n      - kind: Color\n        key: "has space"\n        default: 1\n',
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenKeyInvalid);
    expect(explanation?.path).toBe('scenes[0].tokens[0].key');
  });

  it('qualifies a token refusal with the scene that declares it, not the token index alone', () => {
    const explanation = explainFlightDocumentText(
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
        '  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n' +
        '  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n' +
        '    tokens:\n      - kind: Color\n        key: "9lives"\n        default: 1\n',
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenKeyInvalid);
    expect(explanation?.path).toBe('scenes[1].tokens[0].key');
  });

  it('names a duplicate token key rather than keeping the last row', () => {
    const explanation = explainFlightDocumentText(
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
        '  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n' +
        '    tokens:\n' +
        '      - kind: Color\n        key: color.primary\n        default: 1\n' +
        '      - kind: Color\n        key: color.primary\n        default: 2\n',
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenKeyDuplicate);
    expect(explanation?.tokenKey).toBe('color.primary');
    expect(explanation?.path).toBe('scenes[0].tokens[1].key');
  });

  it('refuses a mode named after a structural key it would collide with', () => {
    const explanation = explainFlightDocumentText(
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
        '  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n' +
        '    tokens:\n      - kind: Color\n        key: color.primary\n        "mode name": 1\n',
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenModeInvalid);
    expect(explanation?.path).toBe('scenes[0].tokens[0].mode name');
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
          layouts: [],
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
          tokens: [],
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
          layouts: [],
          lights: [{ descriptor: createAmbientLight({ intensity: 0.4 }), transform: lightTransform }],
          scene: { children: [], fields: {}, kind: 'Node3D' },
          tokens: [],
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

  it('round-trips normalized interactive states and kind-tagged descriptors using the node name field', () => {
    const document: FlightDocument = {
      defaultScene: 0,
      resources: [],
      scenes: [
        {
          backgroundColor: null,
          kind: 'Scene2D',
          layouts: [],
          scene: {
            children: [],
            fields: { name: 'submit-button' },
            interactiveStates: {
              disabled: { alpha: 0.4, extensions: [] },
              hover: {
                alpha: 0.8,
                extensions: [{ fields: { color: 1722486783, width: 2 }, kind: 'acme.Outline' }],
              },
              pressed: { extensions: [], scaleX: 0.95, scaleY: 0.95 },
            },
            kind: 'DisplayObject',
            transition: { fields: { duration: 150, easing: 'easeOut' }, kind: 'acme.Tween' },
          },
          tokens: [],
        },
      ],
      version: 1,
    };

    const text = formatFlightDocumentText(document);

    expect(text).toContain('name: submit-button');
    expect(text).not.toContain('id:');
    expect(text).toContain('interactiveStates:');
    expect(text).toContain('kind: acme.Outline');
    expect(text).toContain('kind: acme.Tween');
    expect(parseFlightDocumentText(text)).toEqual(document);
  });

  it('round-trips a token section through text and back', () => {
    const text =
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
      '  - kind: Scene2D\n' +
      '    scene:\n      kind: DisplayObject\n' +
      '    tokens:\n' +
      '      - kind: Color\n        key: color.card\n        default: "$color.background"\n' +
      '      - kind: Color\n        key: color.background\n        dark: 439812095\n        light: 4294967295\n';
    const document = parseFlightDocumentText(text);
    if (document === null) throw new Error('expected the token fixture to parse');
    expect(formatFlightDocumentText(document)).toBe(text);
    expect(parseFlightDocumentText(formatFlightDocumentText(document))).toEqual(document);
  });

  it('round-trips scene-local layouts with unknown custom kinds and document-safe styles', () => {
    const text =
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
      '  - kind: Scene2D\n' +
      '    scene:\n      kind: DisplayObject\n      name: panel\n      children:\n' +
      '        - kind: DisplayObject\n          name: header\n' +
      '    layouts:\n' +
      '      - targets:\n          - panel\n          - header\n' +
      '        tree:\n          nodes:\n' +
      '            - kind: acme.Flow\n              parentIndex: -1\n' +
      '              containerStyle:\n                gap: 8\n                policy:\n                  dense: true\n' +
      '            - kind: AnchorLayout\n              parentIndex: 0\n' +
      '              itemStyle:\n                grow: 1\n';

    const document = parseFlightDocumentText(text);
    expect(document).not.toBeNull();
    expect(document?.scenes[0].layouts).toEqual([
      {
        targets: ['panel', 'header'],
        tree: {
          nodes: [
            {
              containerStyle: { gap: 8, policy: { dense: true } },
              itemStyle: null,
              kind: 'acme.Flow',
              parentIndex: -1,
            },
            { containerStyle: null, itemStyle: { grow: 1 }, kind: 'AnchorLayout', parentIndex: 0 },
          ],
        },
      },
    ]);
    expect(formatFlightDocumentText(document!)).toBe(text);
    expect(parseFlightDocumentText(formatFlightDocumentText(document!))).toEqual(document);
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

  it('reads kind-tagged token rows on the scene entry that declares them', () => {
    const document = parseFlightDocumentText(
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
        '  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n' +
        '    tokens:\n' +
        '      - kind: Color\n        key: color.background\n        light: 4294967295\n        dark: 439812095\n' +
        '      - kind: Number\n        key: space.gutter\n        default: 8\n',
    );
    const scene = document?.scenes[0];
    expect(scene?.tokens).toEqual([
      { key: 'color.background', kind: 'Color', values: { dark: 439812095, light: 4294967295 } },
      { key: 'space.gutter', kind: 'Number', values: { default: 8 } },
    ]);
  });

  it('leaves tokens empty when a scene entry declares no section', () => {
    const document = parseFlightDocumentText(
      'flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n',
    );
    expect(document?.scenes[0].tokens).toEqual([]);
    expect(document?.scenes[0].layouts).toEqual([]);
  });

  it.each([
    [
      'empty descriptor',
      '    layouts:\n      - targets:\n        tree:\n          nodes:\n',
      'scenes[0].layouts[0].targets',
    ],
    [
      'target/node count mismatch',
      '    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n            - kind: AnchorLayout\n              parentIndex: 0\n',
      'scenes[0].layouts[0].targets',
    ],
    [
      'duplicate target',
      '    layouts:\n      - targets:\n          - root\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n            - kind: AnchorLayout\n              parentIndex: 0\n',
      'scenes[0].layouts[0].targets[1]',
    ],
    [
      'forward parent',
      '    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: 0\n',
      'scenes[0].layouts[0].tree.nodes[0].parentIndex',
    ],
    [
      'fractional parent',
      '    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -0.5\n',
      'scenes[0].layouts[0].tree.nodes[0].parentIndex',
    ],
    [
      'empty target name',
      '    layouts:\n      - targets:\n          - ""\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n',
      'scenes[0].layouts[0].targets[0]',
    ],
    [
      'scalar style',
      '    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n              containerStyle: row\n',
      'scenes[0].layouts[0].tree.nodes[0].containerStyle',
    ],
    [
      'unknown node key',
      '    layouts:\n      - targets:\n          - root\n        tree:\n          nodes:\n            - kind: FlexLayout\n              parentIndex: -1\n              resolver: hidden\n',
      'scenes[0].layouts[0].tree.nodes[0]',
    ],
  ])('refuses malformed layout structure: %s', (_label, layoutText, path) => {
    const text =
      'flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n' + layoutText;
    expect(explainFlightDocumentText(text)).toMatchObject({
      path,
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });
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

  it('refuses an orphan transition without interactive states', () => {
    const text = [
      'flight: 1',
      'defaultScene: 0',
      'scenes:',
      '  - kind: Scene2D',
      '    scene:',
      '      kind: DisplayObject',
      '      transition:',
      '        kind: acme.Tween',
    ].join('\n');

    expect(explainFlightDocumentText(text)).toMatchObject({
      path: 'scenes[0].scene.transition',
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });
  });

  it('refuses duplicate extension kinds within one phase', () => {
    const text = [
      'flight: 1',
      'defaultScene: 0',
      'scenes:',
      '  - kind: Scene2D',
      '    scene:',
      '      kind: DisplayObject',
      '      interactiveStates:',
      '        hover:',
      '          extensions:',
      '            - kind: acme.Outline',
      '              width: 1',
      '            - kind: acme.Outline',
      '              width: 2',
    ].join('\n');

    expect(explainFlightDocumentText(text)).toMatchObject({
      kind: 'acme.Outline',
      path: 'scenes[0].scene.interactiveStates.hover.extensions[1]',
      reason: FlightDocumentRefusalReason.InteractiveStateExtensionKindDuplicate,
    });
  });

  it('refuses 2D transform properties on a 3D interactive state', () => {
    const text = [
      'flight: 1',
      'defaultScene: 0',
      'scenes:',
      '  - kind: Scene3D',
      '    scene:',
      '      kind: Node3D',
      '      interactiveStates:',
      '        pressed:',
      '          x: 4',
    ].join('\n');

    expect(explainFlightDocumentText(text)).toMatchObject({
      path: 'scenes[0].scene.interactiveStates.pressed.x',
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });
  });
});
