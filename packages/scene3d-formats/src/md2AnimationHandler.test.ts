import type { Md2Frame, Md2ParseContext, MeshMorph, Scene3DDocument } from '@flighthq/types/contract';
import { Scene3DAnimationPathWeights } from '@flighthq/types/contract';

import { md2AnimationHandler } from './md2AnimationHandler.ts';

describe('md2AnimationHandler', () => {
  it('satisfies the Animation feature, which is what the analyzer emits for a multi-frame model', () => {
    expect(md2AnimationHandler.feature).toBe('Animation');
  });

  // MD2 packs several sub-animations into ONE contiguous frame list, distinguished only by a frame-name
  // action prefix with a trailing number. Segmenting on that prefix is the whole behaviour here.
  it('segments frames into one clip per contiguous action prefix', () => {
    const context = contextFor(['stand01', 'stand02', 'run01', 'run02']);
    md2AnimationHandler.collect(context);
    expect(context.document.animations.map((clip) => clip.name)).toEqual(['stand', 'run']);
  });

  it('binds each clip to mesh node 0 on the weights path', () => {
    const context = contextFor(['stand01', 'stand02']);
    md2AnimationHandler.collect(context);
    const channels = context.document.animations[0].channels;
    expect(channels).toHaveLength(1);
    expect(channels[0].node).toBe(0);
    expect(channels[0].path).toBe(Scene3DAnimationPathWeights);
  });

  it('names an unnamed frame run "default", matching MD2’s implicit single animation', () => {
    const context = contextFor(['', '']);
    md2AnimationHandler.collect(context);
    expect(context.document.animations.map((clip) => clip.name)).toEqual(['default']);
  });

  it('suffixes a repeated action so two non-adjacent runs cannot collide', () => {
    const context = contextFor(['walk01', 'jump01', 'walk01']);
    md2AnimationHandler.collect(context);
    expect(context.document.animations.map((clip) => clip.name)).toEqual(['walk', 'jump', 'walk.2']);
  });

  // A single-frame model has no motion, and a model whose morph is absent has nothing for a weight track
  // to drive — both contribute no clip rather than an empty one.
  it('contributes nothing when there is no morph to drive', () => {
    const context = { ...contextFor(['stand01', 'stand02']), morph: null };
    md2AnimationHandler.collect(context);
    expect(context.document.animations).toEqual([]);
  });

  it('times keyframes at the MD2 frame rate', () => {
    const context = contextFor(['stand01', 'stand02', 'stand03']);
    md2AnimationHandler.collect(context);
    // Three frames at 10fps: the clip spans 0 to 0.2s.
    expect(context.document.animations[0].duration).toBeCloseTo(0.2, 5);
  });
});

// The handler reads only `frames` and `morph`, so the fixture supplies exactly those: named frames and a
// morph with one target per frame after the base pose, which is what the parser builds.
function contextFor(frameNames: readonly string[]): Md2ParseContext {
  const frames: Md2Frame[] = frameNames.map((name) => ({
    name,
    normals: new Float32Array(3),
    positions: new Float32Array(3),
  }));
  const morph: MeshMorph = {
    targets: frameNames.slice(1).map(() => ({
      normalDeltas: new Float32Array(3),
      positionDeltas: new Float32Array(3),
      tangentDeltas: null,
    })),
    weights: new Float32Array(Math.max(frameNames.length - 1, 0)),
  };
  return {
    bytes: new Uint8Array(0),
    diagnostics: [],
    document: emptyDocument(),
    frames,
    meshMaterials: [],
    morph,
    numSkins: 0,
    offSkins: 0,
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
