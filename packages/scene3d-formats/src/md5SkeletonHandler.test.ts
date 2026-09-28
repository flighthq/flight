import type { Md5Joint, Md5ParseContext, Scene3DDocument } from '@flighthq/types/contract';
import { MD5_SKELETON_FEATURE } from '@flighthq/types/contract';

import { buildMd5SkeletonDocument, md5SkeletonFamily, md5SkeletonHandler } from './md5SkeletonHandler.ts';

// ★ MOVED HERE WITH THE FUNCTION. This described `buildMd5SkeletonDocument` while it lived in `md5Parse.ts`, and its old
// comment said the export existed so the handler "can wrap it without moving a hundred lines of quaternion work out of
// this module" — which is exactly the shim the move removed. The assertions are unchanged, and what they add over the
// handler's own cases below is the NESTING: each joint is wired under its parent, so the skeleton group holds only the
// root and the root holds the spine. That is the claim MD5 skinning gets wrong by flattening.
describe('buildMd5SkeletonDocument', () => {
  it('wires every joint under its parent, leaving only the roots under the skeleton group', () => {
    const document = emptyDocument();
    const skin = buildMd5SkeletonDocument([joint('root', -1), joint('spine', 0, 1)], document, null);

    expect(document.nodes[0].name).toBe('skeleton');
    expect(document.nodes).toHaveLength(3);
    expect(skin.joints).toHaveLength(2);
    expect(document.nodes[0].children).toEqual([1]);
    expect(document.nodes[1].children).toEqual([2]);
  });
});

describe('md5SkeletonFamily', () => {
  it('covers the Skeleton feature', () => {
    expect(md5SkeletonFamily.map((handler) => handler.feature)).toEqual([MD5_SKELETON_FEATURE]);
  });
});

function joint(name: string, parentIndex: number, positionY = 0): Md5Joint {
  return {
    name,
    orientationW: 1,
    orientationX: 0,
    orientationY: 0,
    orientationZ: 0,
    parentIndex,
    positionX: 0,
    positionY,
    positionZ: 0,
  };
}

function contextFor(joints: readonly Md5Joint[]): Md5ParseContext {
  return {
    diagnostics: [],
    document: emptyDocument(),
    drops: null,
    joints,
    mesh: null,
    skin: null,
  };
}

function emptyDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };
}

describe('md5SkeletonHandler', () => {
  it('claims the Skeleton feature the analyzer emits for a jointed mesh', () => {
    expect(md5SkeletonHandler.feature).toBe(MD5_SKELETON_FEATURE);
  });

  it('emits a skeleton group plus one node per joint, and the skin meshes bind', () => {
    const context = contextFor([joint('root', -1), joint('spine', 0, 1)]);
    md5SkeletonHandler.collect(context);
    // One group node named 'skeleton' plus one node per joint.
    expect(context.document.nodes).toHaveLength(3);
    expect(context.document.nodes[0].name).toBe('skeleton');
    expect(context.document.skins).toHaveLength(1);
    expect(context.document.skins[0].joints).toHaveLength(2);
  });

  // The skin index has to cross from this dispatch point to the per-mesh one, which is why it is recorded on
  // the context rather than returned.
  it('records the skin index on the context for the mesh assembly to read back', () => {
    const context = contextFor([joint('root', -1)]);
    expect(context.skin).toBeNull();
    md5SkeletonHandler.collect(context);
    expect(context.skin).toBe(0);
  });

  it('does nothing for a file that declares no joints, leaving no skin to bind', () => {
    const context = contextFor([]);
    md5SkeletonHandler.collect(context);
    expect(context.document.nodes).toEqual([]);
    expect(context.document.skins).toEqual([]);
    expect(context.skin).toBeNull();
  });
});
