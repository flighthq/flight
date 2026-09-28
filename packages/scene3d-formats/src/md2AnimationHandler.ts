import { createAnimationTrack } from '@flighthq/animation/contract';
import type { Md2Frame, Md2SectionHandler, MeshMorph, Scene3DDocumentAnimation } from '@flighthq/types/contract';
import { Scene3DAnimationPathWeights } from '@flighthq/types/contract';

import { MD2_FRAME_FPS } from './md2Schema.ts';

/**
 * Realizes MD2's per-frame vertex animation as weight-track channels on the generic morph substrate.
 *
 * MD2 encodes named sub-animations by frame-name prefix ("stand01".."run06".."attack01"), so the frames are
 * segmented into one named clip per contiguous same-prefix run rather than one clip for the file. Within a
 * clip, adjacent-frame weights form the two-frame lerp MD2 semantics call for. A single-frame model has no
 * motion and contributes nothing.
 *
 * ★ THIS HANDLER IS WHY `@flighthq/animation` IS LINKED. The morph substrate itself is geometry and is
 * built regardless; what this adds is the clips that drive it. Omitting the handler yields a model posed at
 * frame 0 with its morph targets present and no animation to play them — a static pose, not a broken mesh.
 */
export const md2AnimationHandler: Readonly<Md2SectionHandler> = {
  collect(context) {
    context.document.animations.push(...buildMd2MorphAnimations(context.frames, context.morph));
  },
  feature: 'Animation',
};

/** The animation family, beside its handler so naming it links this handler and not the skin's. */
export const md2AnimationFamily: readonly Md2SectionHandler[] = [md2AnimationHandler];

// Segments MD2's frames into named vertex-morph clips, one per contiguous run of same-action frames.
// MD2 stores each sub-animation as a run of frames whose names share an action prefix and end in a
// frame number ("stand01".."stand40"); `md2FrameActionName` recovers that prefix, and contiguous
// same-prefix frames become one `Scene3DDocumentAnimation`. Returns an empty array for a model with no
// morph (single frame). A model whose frames carry no names collapses to one clip named 'default',
// identical to MD2's implicit single animation. Each clip binds mesh node 0.
function buildMd2MorphAnimations(frames: readonly Md2Frame[], morph: MeshMorph | null): Scene3DDocumentAnimation[] {
  if (morph === null) return [];
  const targetCount = morph.targets.length;
  if (targetCount === 0) return [];

  const animations: Scene3DDocumentAnimation[] = [];
  const usedNames = new Set<string>();
  let runStart = 0;
  for (let k = 1; k <= frames.length; k++) {
    const runAction = md2FrameActionName(frames[runStart].name);
    // Close the run at the buffer end or when the next frame's action prefix differs.
    if (k < frames.length && md2FrameActionName(frames[k].name) === runAction) continue;
    animations.push(buildMd2ActionClip(runAction, runStart, k - 1, targetCount, usedNames));
    runStart = k;
  }
  return animations;
}

// Builds one named clip for the contiguous frame run [startFrame..endFrame] (absolute frame indices).
// Frame 0 is the morph base pose (all weights zero); frame k≥1 is morph target k-1. The clip's weight
// track has one keyframe per frame at clip-local time (i / MD2_FRAME_FPS), each keyframe's full-width
// value vector activating only that frame's target — linear interpolation between adjacent keyframes
// then blends frame → frame+1, the two-frame lerp MD2 semantics call for. The track width stays the
// mesh's full morph-target count because a `weights` channel drives the whole weight array.
function buildMd2ActionClip(
  action: string,
  startFrame: number,
  endFrame: number,
  targetCount: number,
  usedNames: Set<string>,
): Scene3DDocumentAnimation {
  const count = endFrame - startFrame + 1;
  const times = new Float32Array(count);
  const values = new Float32Array(count * targetCount);
  for (let i = 0; i < count; i++) {
    const frame = startFrame + i;
    times[i] = i / MD2_FRAME_FPS;
    if (frame >= 1) values[i * targetCount + (frame - 1)] = 1;
  }
  const track = createAnimationTrack({ components: targetCount, interpolation: 'Linear', times, values });
  return {
    channels: [{ node: 0, path: Scene3DAnimationPathWeights, track }],
    duration: times[count - 1],
    name: uniqueMd2ClipName(action, usedNames),
  };
}

// Recovers the sub-animation action name from a frame name by stripping the trailing frame-number run
// ("stand01" → "stand", "run1" → "run"). Returns '' for a name that is empty or purely numeric, which
// callers map to the 'default' clip. This is the frame-name convention id Software's MD2 exporters use
// to pack multiple actions into one contiguous frame list.
function md2FrameActionName(frameName: string): string {
  return frameName.trim().replace(/\d+$/, '');
}

// Produces a clip name unique within this document. An empty action prefix becomes 'default'; a name
// already taken (two non-adjacent runs of the same action) gets a numeric suffix so name-keyed scene
// animation maps never collide.
function uniqueMd2ClipName(action: string, usedNames: Set<string>): string {
  const base = action.length > 0 ? action : 'default';
  let name = base;
  for (let n = 2; usedNames.has(name); n++) name = `${base}.${n}`;
  usedNames.add(name);
  return name;
}
