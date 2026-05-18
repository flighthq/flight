import {
  addTextureAtlasRegion,
  attachSpritesheetTimeline,
  BitmapKind,
  createCanvasRenderState,
  createImageSource,
  createMovieClip,
  createSpritesheet,
  createSpritesheetAnimation,
  createSpritesheetFrame,
  createTextureAtlas,
  defaultCanvasBitmapRenderer,
  playTimeline,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  updateDisplayObjectBeforeRender,
  updateMovieClip,
} from '@flighthq/engine';

const FRAME_W = 220;
const FRAME_H = 220;
const MARGIN = 2;
const GAP = 4;
const COLS_PER_ROW = [5, 4];
const FPS = 10;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

const image = await loadImage('assets/nyancat.png');
const source = createImageSource(image);
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
attachSpritesheetTimeline(clip, spritesheet, animation);
playTimeline(clip.data.timeline!);

const canvas = document.createElement('canvas');
canvas.width = FRAME_W;
canvas.height = FRAME_H;
document.getElementById('app')!.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0x000000ff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);

let lastTime = performance.now();

function enterFrame(time: number): void {
  const deltaTime = time - lastTime;
  lastTime = time;

  updateMovieClip(clip, deltaTime);

  updateDisplayObjectBeforeRender(state, clip);
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, clip);

  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
