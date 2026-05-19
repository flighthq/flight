import { addChild, setX, setY } from '@flighthq/scenegraph-core';
import { createBitmap } from '@flighthq/scenegraph-display';
import { createTimeline, playMovieClip } from '@flighthq/timeline';
import type { MovieClip, Spritesheet, SpritesheetAnimation } from '@flighthq/types';

export function attachSpritesheetTimeline(
  clip: MovieClip,
  spritesheet: Readonly<Spritesheet>,
  animation: Readonly<SpritesheetAnimation>,
): void {
  const bitmap = createBitmap();
  bitmap.data.image = spritesheet.atlas?.image ?? null;
  addChild(clip, bitmap);

  clip.data.timeline = createTimeline({
    frameRate: 1000 / animation.frameDuration,
    onEnterFrame: (frame) => {
      if (!spritesheet.atlas) return;
      const spritesheetFrame = spritesheet.frames[animation.frames[frame - 1]];
      if (!spritesheetFrame) return;
      bitmap.scrollRect = spritesheet.atlas.regions[spritesheetFrame.id];
      setX(bitmap, spritesheetFrame.offsetX - animation.originX);
      setY(bitmap, spritesheetFrame.offsetY - animation.originY);
    },
    totalFrames: animation.frames.length,
  });

  playMovieClip(clip);
}
