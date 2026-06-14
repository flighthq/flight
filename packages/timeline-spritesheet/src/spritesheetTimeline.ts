import { createBitmap } from '@flighthq/displayobject';
import { addSceneChild, invalidateLocalTransform } from '@flighthq/node';
import { createTimeline, playMovieClip } from '@flighthq/timeline';
import type { MovieClip, Spritesheet, SpritesheetAnimation } from '@flighthq/types';

export function attachSpritesheetTimeline(
  clip: MovieClip,
  spritesheet: Readonly<Spritesheet>,
  animation: Readonly<SpritesheetAnimation>,
): void {
  const bitmap = createBitmap();
  bitmap.data.image = spritesheet.atlas?.image ?? null;
  addSceneChild(clip, bitmap);

  clip.data.timeline = createTimeline({
    frameRate: 1000 / animation.frameDuration,
    constructFrame: (frame: number) => {
      if (!spritesheet.atlas) return;
      const spritesheetFrame = spritesheet.frames[animation.frames[frame - 1]];
      if (!spritesheetFrame) return;
      bitmap.data.sourceRectangle = spritesheet.atlas.regions[spritesheetFrame.id];
      bitmap.x = spritesheetFrame.offsetX - animation.originX;
      bitmap.y = spritesheetFrame.offsetY - animation.originY;
      invalidateLocalTransform(bitmap);
    },
    totalFrames: animation.frames.length,
  });

  playMovieClip(clip);
}
