import { createAnimationTrack } from '@flighthq/animation';
import { createTransform3D } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { CANONICAL_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import type { MaterialLike, Mesh, SceneDocument, SceneNode } from '@flighthq/types';
import { SceneAnimationPathTranslation, SceneNodeKind, MeshKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { isMesh } from './mesh';
import { createSceneFromDocument, createScenesFromDocument } from './sceneDocument';

function emptyDocument(): SceneDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}

function triangleGeometry(): ReturnType<typeof createMeshGeometry> {
  return createMeshGeometry({ layout: CANONICAL_MESH_GEOMETRY_LAYOUT, vertices: new Float32Array(12 * 3) });
}

describe('createSceneFromDocument', () => {
  it('returns an empty scene for an empty document', () => {
    const scene = createSceneFromDocument(emptyDocument());
    expect(getNodeChildren(scene.root)).toHaveLength(0);
    expect(scene.metadata).toBe(null);
  });

  it('builds a mesh node from a document mesh, resolving materials by index', () => {
    const material = createStandardPbrMaterial() as unknown as MaterialLike;
    const document = emptyDocument();
    document.materials = [material];
    document.meshes = [{ geometry: triangleGeometry(), materials: [0] }];
    document.nodes = [{ children: [], kind: MeshKind, mesh: 0, transform: createTransform3D() }];
    document.scenes = [{ rootNodes: [0] }];

    const scene = createSceneFromDocument(document);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(1);
    expect(isMesh(roots[0] as SceneNode)).toBe(true);
    expect((roots[0] as unknown as Mesh).materials[0]).toBe(material);
  });

  it('wires child index lists into the built hierarchy', () => {
    const document = emptyDocument();
    const parent = createTransform3D();
    const child = createTransform3D();
    document.nodes = [
      { children: [1], kind: SceneNodeKind, name: 'parent', transform: parent },
      { children: [], kind: SceneNodeKind, name: 'child', transform: child },
    ];
    document.scenes = [{ rootNodes: [0] }];

    const scene = createSceneFromDocument(document);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(1);
    expect(getNodeChildren(roots[0] as SceneNode)).toHaveLength(1);
  });

  it('applies a node transform onto the built node', () => {
    const document = emptyDocument();
    const transform = createTransform3D();
    transform.position.x = 5;
    document.nodes = [{ children: [], kind: SceneNodeKind, transform }];
    document.scenes = [{ rootNodes: [0] }];

    const scene = createSceneFromDocument(document);
    const node = getNodeChildren(scene.root)[0] as SceneNode;
    expect(node.position.x).toBe(5);
  });

  it('binds a skin by joint index onto the mesh it names', () => {
    const document = emptyDocument();
    document.meshes = [{ geometry: triangleGeometry(), materials: [], skin: 0 }];
    document.nodes = [
      { children: [1], kind: MeshKind, mesh: 0, transform: createTransform3D() },
      { children: [], kind: SceneNodeKind, name: 'joint', transform: createTransform3D() },
    ];
    document.skins = [{ inverseBind: [{ m: identity16() }], joints: [1] }];
    document.scenes = [{ rootNodes: [0] }];

    const scene = createSceneFromDocument(document);
    const mesh = getNodeChildren(scene.root)[0] as unknown as Mesh;
    expect(mesh.skin).toBeTruthy();
    expect(mesh.skin?.skeleton.joints).toHaveLength(1);
    expect(mesh.skin?.skeleton.names).toEqual(['joint']);
  });

  it('rebuilds a node-bound animation clip from a document channel', () => {
    const document = emptyDocument();
    document.nodes = [{ children: [], kind: SceneNodeKind, transform: createTransform3D() }];
    document.scenes = [{ rootNodes: [0] }];
    const track = createAnimationTrack({ components: 3, times: [0, 1], values: [0, 0, 0, 1, 2, 3] });
    document.animations = [
      { channels: [{ node: 0, path: SceneAnimationPathTranslation, track }], duration: 1, name: 'move' },
    ];

    const scene = createSceneFromDocument(document);
    expect(Object.keys(scene.animations)).toEqual(['move']);
    expect(scene.animations.move.duration).toBe(1);
    expect(scene.animations.move.channels[0].track).toBe(track);
  });

  it('selects the scene at the given index', () => {
    const document = emptyDocument();
    document.nodes = [
      { children: [], kind: SceneNodeKind, name: 'a', transform: createTransform3D() },
      { children: [], kind: SceneNodeKind, name: 'b', transform: createTransform3D() },
    ];
    document.scenes = [{ rootNodes: [0] }, { rootNodes: [1] }];

    const scene = createSceneFromDocument(document, 1);
    expect((getNodeChildren(scene.root)[0] as SceneNode).name).toBe('b');
  });
});

describe('createScenesFromDocument', () => {
  it('builds every scene the document declares, sharing one node pool', () => {
    const document = emptyDocument();
    document.nodes = [
      { children: [], kind: SceneNodeKind, transform: createTransform3D() },
      { children: [], kind: SceneNodeKind, transform: createTransform3D() },
    ];
    document.scenes = [{ rootNodes: [0] }, { rootNodes: [1] }];

    const scenes = createScenesFromDocument(document);
    expect(scenes).toHaveLength(2);
    expect(getNodeChildren(scenes[0].root)).toHaveLength(1);
    expect(getNodeChildren(scenes[1].root)).toHaveLength(1);
  });

  it('attaches the animations to the first scene, bound to the shared node instance', () => {
    const document = emptyDocument();
    document.nodes = [
      { children: [], kind: SceneNodeKind, transform: createTransform3D() },
      { children: [], kind: SceneNodeKind, transform: createTransform3D() },
    ];
    document.scenes = [{ rootNodes: [0] }, { rootNodes: [1] }];
    const track = createAnimationTrack({ components: 3, times: [0, 1], values: [0, 0, 0, 1, 1, 1] });
    document.animations = [
      { channels: [{ node: 1, path: SceneAnimationPathTranslation, track }], duration: 1, name: 'spin' },
    ];

    const scenes = createScenesFromDocument(document);
    expect(Object.keys(scenes[0].animations)).toEqual(['spin']);
    const target = scenes[0].animations.spin.channels[0].targetRef as { node: SceneNode };
    expect(target.node).toBe(getNodeChildren(scenes[1].root)[0]);
  });

  it('returns an empty array for a scene-less document', () => {
    expect(createScenesFromDocument(emptyDocument())).toHaveLength(0);
  });
});

function identity16(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}
