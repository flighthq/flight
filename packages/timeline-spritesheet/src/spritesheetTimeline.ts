import { addSceneChild, setTransformX, setTransformY } from '@flighthq/scene';
import { createBitmap } from '@flighthq/scene-display';
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
      setTransformX(bitmap, spritesheetFrame.offsetX - animation.originX);
      setTransformY(bitmap, spritesheetFrame.offsetY - animation.originY);
    },
    totalFrames: animation.frames.length,
  });

  playMovieClip(clip);
}
