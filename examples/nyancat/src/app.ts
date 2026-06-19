import {
  addTextureAtlasRegion,
  connectSignal,
  createApplication,
  createMovieClip,
  createSpritesheet,
  createSpritesheetAnimation,
  createSpritesheetFrame,
  createSpritesheetTimelineSource,
  createTextureAtlas,
  loadImageResourceFromURL,
  playMovieClip,
  setMovieClipSource,
  startApplicationLoop,
  updateMovieClip,
} from '@flighthq/sdk';

import { render, scale } from './render';

const FRAME_W = 220;
const FRAME_H = 220;
const MARGIN = 2;
const GAP = 4;
const COLS_PER_ROW = [5, 4];
const FPS = 10;

const source = await loadImageResourceFromURL('assets/nyancat.png');
const atlas = createTextureAtlas({ image: source });

const frames = [];
for (let row = 0; row < COLS_PER_ROW.length; row++) {
  for (let col = 0; col < COLS_PER_ROW[row]; col++) {
    const id = atlas.regions.length;
    addTextureAtlasRegion(atlas, MARGIN + col * (FRAME_W + GAP), MARGIN + row * (FRAME_H + GAP), FRAME_W, FRAME_H);
    frames.push(createSpritesheetFrame({ id }));
  }
}

const animation = createSpritesheetAnimation({
  frames: frames.map((_, i) => i),
  frameDuration: 1000 / FPS,
  loop: true,
});

const spritesheet = createSpritesheet({
  atlas,
  frames,
  animations: { nyancat: animation },
});

const clip = createMovieClip();
setMovieClipSource(clip, createSpritesheetTimelineSource(spritesheet, animation));
playMovieClip(clip);
clip.scaleX = scale;
clip.scaleY = scale;

const app = createApplication();
connectSignal(app.onUpdate, (delta) => updateMovieClip(clip, delta));
connectSignal(app.onRender, () => {
  render(clip);
});
startApplicationLoop(app);
