import { createBitmap } from '@flighthq/displayobject';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import type { Bitmap, DisplayObject, Spritesheet, SpritesheetAnimation, TimelineSource } from '@flighthq/types';

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
): TimelineSource {
  const bitmaps = new WeakMap<DisplayObject, Bitmap>();
  return {
    totalFrames: animation.frames.length,
    labels: [],
    frameRate: 1000 / animation.frameDuration,
    constructFrame(target: DisplayObject, frame: number): void {
      const atlas = spritesheet.atlas;
      if (atlas === null) return;

      let bitmap = bitmaps.get(target);
      if (bitmap === undefined) {
        bitmap = createBitmap();
        bitmap.data.image = atlas.image;
        addNodeChild(target, bitmap);
        bitmaps.set(target, bitmap);
      }

      const sheetFrame = spritesheet.frames[animation.frames[frame - 1]];
      if (sheetFrame === undefined) return;
      bitmap.data.sourceRectangle = atlas.regions[sheetFrame.id];
      bitmap.x = sheetFrame.offsetX - animation.originX;
      bitmap.y = sheetFrame.offsetY - animation.originY;
      invalidateNodeLocalTransform(bitmap);
    },
  };
}
