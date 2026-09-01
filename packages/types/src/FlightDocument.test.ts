import type { Camera3D, Projection } from './Camera3D';
import type {
  FlightDocument,
  FlightDocumentScene,
  FlightDocumentScene2D,
  FlightDocumentScene2DMaterialization,
  FlightDocumentScene3D,
  FlightDocumentScene3DMaterialization,
} from './FlightDocument';
import type { FlightDocumentInteractiveStateBinding } from './FlightDocumentInteractiveState';
import type { FlightDocumentResourceDescriptor } from './FlightDocumentResource';
import type { Light } from './Light';
import type { Node2D } from './Node2D';
import type { Node3D } from './Node3D';
import type { Scene2D } from './Scene2D';
import type { Scene3D } from './Scene3D';
import type { Scene3DDocumentCamera, Scene3DDocumentLight } from './Scene3DDocument';
import type { Scene3DLights } from './Scene3DLights';
import type { Transform3D } from './Transform3D';

describe('FlightDocument', () => {
  it('groups mixed-dimension scenes over one shared resource table', () => {
    const document: FlightDocument = {
      defaultScene: 1,
      resources: [{ fields: { source: 'shared.png' }, key: 'shared', kind: 'Texture' }],
      scenes: [
        {
          backgroundColor: 0x112233ff,
          kind: 'Scene2D',
          scene: {
            children: [{ children: [], fields: { texture: 'shared' }, kind: 'Sprite' }],
            fields: {},
            kind: 'DisplayObject',
          },
          tokens: [],
        },
        {
          cameras: [],
          kind: 'Scene3D',
          lights: [],
          scene: {
            children: [{ children: [], fields: { texture: 'shared' }, kind: 'Mesh' }],
            fields: {},
            kind: 'Node3D',
          },
          tokens: [],
        },
      ],
      version: 1,
    };

    expect(document.resources).toHaveLength(1);
    expect(document.scenes.map((scene) => scene.kind)).toEqual(['Scene2D', 'Scene3D']);
    expect(document.scenes[document.defaultScene]?.kind).toBe('Scene3D');
    expect(document.scenes[0].scene.children[0]?.fields.texture).toBe('shared');
    expect(document.scenes[1].scene.children[0]?.fields.texture).toBe('shared');
  });

  it('owns the version, shared resources, non-empty scenes, and default index', () => {
    expectTypeOf<keyof FlightDocument>().toEqualTypeOf<'defaultScene' | 'resources' | 'scenes' | 'version'>();
    expectTypeOf<FlightDocument['defaultScene']>().toEqualTypeOf<number>();
    expectTypeOf<FlightDocument['resources']>().toEqualTypeOf<FlightDocumentResourceDescriptor[]>();
    expectTypeOf<FlightDocument['scenes']>().toEqualTypeOf<[FlightDocumentScene, ...FlightDocumentScene[]]>();
    expectTypeOf<FlightDocument['version']>().toEqualTypeOf<1>();
  });
});

describe('FlightDocumentScene', () => {
  it('is the self-identifying union of the two scene-entry shapes', () => {
    expectTypeOf<FlightDocumentScene>().toEqualTypeOf<FlightDocumentScene2D | FlightDocumentScene3D>();
  });
});

describe('FlightDocumentScene2D', () => {
  it('follows Scene2DDocument metadata and has no camera field', () => {
    expectTypeOf<keyof FlightDocumentScene2D>().toEqualTypeOf<'backgroundColor' | 'kind' | 'scene' | 'tokens'>();
    expectTypeOf<FlightDocumentScene2D['backgroundColor']>().toEqualTypeOf<number | null>();
  });
});

describe('FlightDocumentScene2DMaterialization', () => {
  it('owns inert interactive-state bindings beside the scene', () => {
    expectTypeOf<keyof FlightDocumentScene2DMaterialization>().toEqualTypeOf<'interactiveStateBindings' | 'scene'>();
    expectTypeOf<FlightDocumentScene2DMaterialization['interactiveStateBindings']>().toEqualTypeOf<
      FlightDocumentInteractiveStateBinding<Node2D>[]
    >();
    expectTypeOf<FlightDocumentScene2DMaterialization['scene']>().toEqualTypeOf<Scene2D>();
  });
});

describe('FlightDocumentScene3D', () => {
  it('keeps cameras and lights on the 3D scene entry rather than the shared container', () => {
    expectTypeOf<keyof FlightDocumentScene3D>().toEqualTypeOf<'cameras' | 'kind' | 'lights' | 'scene' | 'tokens'>();
  });

  it('uses the existing Scene3DDocument camera array without renamed projection fields', () => {
    expectTypeOf<FlightDocumentScene3D['cameras']>().toEqualTypeOf<Scene3DDocumentCamera[]>();
    expectTypeOf<keyof Scene3DDocumentCamera>().toEqualTypeOf<
      'far' | 'name' | 'near' | 'node' | 'projection' | 'transform'
    >();
    expectTypeOf<Scene3DDocumentCamera['projection']>().toEqualTypeOf<Projection>();
    expectTypeOf<Scene3DDocumentCamera['transform']>().toEqualTypeOf<Transform3D>();
  });

  it('uses the existing Scene3DDocument light placement shape with no authored direction field', () => {
    expectTypeOf<FlightDocumentScene3D['lights']>().toEqualTypeOf<Scene3DDocumentLight[]>();
    expectTypeOf<keyof Scene3DDocumentLight>().toEqualTypeOf<'descriptor' | 'name' | 'node' | 'transform'>();
    expectTypeOf<Scene3DDocumentLight['descriptor']>().toEqualTypeOf<Light>();
    expectTypeOf<Scene3DDocumentLight['transform']>().toEqualTypeOf<Transform3D>();
  });
});

describe('FlightDocumentScene3DMaterialization', () => {
  it('owns a camera array, runtime lights, and inert interactive-state bindings beside the scene', () => {
    expectTypeOf<keyof FlightDocumentScene3DMaterialization>().toEqualTypeOf<
      'cameras' | 'interactiveStateBindings' | 'lights' | 'scene'
    >();
    expectTypeOf<FlightDocumentScene3DMaterialization['cameras']>().toEqualTypeOf<Camera3D[]>();
    expectTypeOf<FlightDocumentScene3DMaterialization['lights']>().toEqualTypeOf<Scene3DLights>();
    expectTypeOf<FlightDocumentScene3DMaterialization['interactiveStateBindings']>().toEqualTypeOf<
      FlightDocumentInteractiveStateBinding<Node3D>[]
    >();
    expectTypeOf<FlightDocumentScene3DMaterialization['scene']>().toEqualTypeOf<Scene3D>();
  });
});
