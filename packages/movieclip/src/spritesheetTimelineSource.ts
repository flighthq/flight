import { createEntity } from '@flighthq/entity/contract';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import { getTextureAtlasRegionTexture } from '@flighthq/textureatlas/contract';
import type {
  Entity,
  EntityWithoutRuntime,
  Node2D,
  Sprite,
  Spritesheet,
  SpritesheetAnimation,
  SpritesheetTimelineSourceExplanation,
  SpritesheetTimelineSourceGuard,
  TimelineSource,
} from '@flighthq/types/contract';

// Exposes a spritesheet animation as a TimelineSource so a MovieClip can play it (the spritesheet side of
// the timeline frame-source contract — `@flighthq/timeline` consumes `TimelineSource`, this produces one,
// and neither depends on the other beyond the shared interface in `@flighthq/types`). Each frame swaps
// the displayed atlas region and offset on a bitmap the source lazily creates as a child of the target
// the first time it constructs onto that target; tracking the bitmap per target keeps the source
// shareable across many MovieClips.
//
// Bind it with `setMovieClipSource(clip, createSpritesheetTimelineSource(sheet, anim))`, then `playMovieClip`.
export function createSpritesheetTimelineSource(
  spritesheet: Readonly<Spritesheet>,
  animation: Readonly<SpritesheetAnimation>,
): TimelineSource & Entity {
  const bitmaps = new WeakMap<Node2D, Sprite>();
  const frames = materializeSpritesheetTimelineFrames(animation);
  if (_spritesheetTimelineSourceGuard !== null) {
    _spritesheetTimelineSourceGuard(animation, explainSpritesheetTimelineSource(animation));
  }
  return createEntity<EntityWithoutRuntime<TimelineSource>>({
    totalFrames: frames.length,
    labels: [],
    // A spritesheet animation is pure frame content; the format carries nothing to cue.
    cues: [],
    frameRate: 1000 / animation.frameDuration,
    constructFrame(target: Node2D, frame: number): void {
      const atlas = spritesheet.atlas;
      if (atlas === null) return;

      let bitmap = bitmaps.get(target);
      if (bitmap === undefined) {
        bitmap = createSprite();
        addNodeChild(target, bitmap);
        bitmaps.set(target, bitmap);
      }

      const sheetFrame = spritesheet.frames[frames[frame - 1]];
      if (sheetFrame === undefined) return;
      bitmap.data.texture = getTextureAtlasRegionTexture(atlas, sheetFrame.id);
      bitmap.x = sheetFrame.offsetX - animation.originX;
      bitmap.y = sheetFrame.offsetY - animation.originY;
      invalidateNodeLocalTransform(bitmap);
    },
  });
}

// Reports the authored playback fields the TimelineSource vocabulary cannot carry. Direction is exact:
// createSpritesheetTimelineSource expands reverse and ping-pong directions into the source frame list.
export function explainSpritesheetTimelineSource(
  animation: Readonly<SpritesheetAnimation>,
): SpritesheetTimelineSourceExplanation {
  return {
    directionMaterialized: true,
    unsupportedFields:
      animation.frameDurations === null ? REPEAT_COUNT_UNSUPPORTED : FRAME_DURATIONS_AND_REPEAT_COUNT_UNSUPPORTED,
  };
}

// Diagnostics seam used by enableMovieClipGuards. Null restores the zero-message production path.
export function setSpritesheetTimelineSourceGuard(guard: SpritesheetTimelineSourceGuard | null): void {
  _spritesheetTimelineSourceGuard = guard;
}

// Converts the animation's direction into an ordinary forward TimelineSource frame sequence. A loop over
// [0,1,2,1] has the same boundary as spritesheet ping-pong: its next frame is 0, with neither endpoint
// duplicated. Reverse ping-pong follows the same rule from the other endpoint.
function materializeSpritesheetTimelineFrames(animation: Readonly<SpritesheetAnimation>): readonly number[] {
  const frames = animation.frames;
  if (frames.length < 2 || animation.direction === 'forward') return frames;
  if (animation.direction === 'reverse') return [...frames].reverse();

  const out: number[] = [];
  if (animation.direction === 'pingpong') {
    for (let index = 0; index < frames.length; index++) out.push(frames[index]);
    for (let index = frames.length - 2; index > 0; index--) out.push(frames[index]);
    return out;
  }

  for (let index = frames.length - 1; index >= 0; index--) out.push(frames[index]);
  for (let index = 1; index < frames.length - 1; index++) out.push(frames[index]);
  return out;
}

const FRAME_DURATIONS_AND_REPEAT_COUNT_UNSUPPORTED = ['frameDurations', 'repeatCount'] as const;
const REPEAT_COUNT_UNSUPPORTED = ['repeatCount'] as const;
let _spritesheetTimelineSourceGuard: SpritesheetTimelineSourceGuard | null = null;
