import type { Camera3D, Projection } from './Camera3D';
import type {
  FlightDocument,
  FlightDocumentScene2D,
  FlightDocumentScene2DMaterialization,
  FlightDocumentScene3D,
  FlightDocumentScene3DMaterialization,
} from './FlightDocument';
import type { Light } from './Light';
import type { Scene2D } from './Scene2D';
import type { Scene3D } from './Scene3D';
import type { Scene3DDocumentCamera, Scene3DDocumentLight } from './Scene3DDocument';
import type { Scene3DLights } from './Scene3DLights';
import type { Transform3D } from './Transform3D';

describe('FlightDocument', () => {
  it('keeps the dimension in metadata and node children nested', () => {
    const document: FlightDocument = {
      backgroundColor: 0x112233ff,
      kind: 'Scene2D',
      resources: [],
      scene: {
        children: [{ children: [], fields: { texture: 'hero' }, kind: 'Sprite' }],
        fields: {},
        kind: 'DisplayObject',
      },
      version: 1,
    };

    expect(document.scene.children[0]?.kind).toBe('Sprite');
    expect(document.backgroundColor).toBe(0x112233ff);
  });
});

describe('FlightDocumentScene2D', () => {
  it('follows Scene2DDocument metadata and has no camera field', () => {
    expectTypeOf<keyof FlightDocumentScene2D>().toEqualTypeOf<
      'backgroundColor' | 'kind' | 'resources' | 'scene' | 'version'
    >();
    expectTypeOf<FlightDocumentScene2D['backgroundColor']>().toEqualTypeOf<number | null>();
  });
});

describe('FlightDocumentScene2DMaterialization', () => {
  it('owns only the scene because Scene2DDocument expresses no camera', () => {
    expectTypeOf<keyof FlightDocumentScene2DMaterialization>().toEqualTypeOf<'scene'>();
    expectTypeOf<FlightDocumentScene2DMaterialization['scene']>().toEqualTypeOf<Scene2D>();
  });
});

describe('FlightDocumentScene3D', () => {
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
  it('owns a camera array and runtime lights beside the scene', () => {
    expectTypeOf<keyof FlightDocumentScene3DMaterialization>().toEqualTypeOf<'cameras' | 'lights' | 'scene'>();
    expectTypeOf<FlightDocumentScene3DMaterialization['cameras']>().toEqualTypeOf<Camera3D[]>();
    expectTypeOf<FlightDocumentScene3DMaterialization['lights']>().toEqualTypeOf<Scene3DLights>();
    expectTypeOf<FlightDocumentScene3DMaterialization['scene']>().toEqualTypeOf<Scene3D>();
  });
});
