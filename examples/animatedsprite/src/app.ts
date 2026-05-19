import {
  addChild,
  addTextureAtlasRegion,
  createCanvasRenderState,
  createSprite,
  createSpritesheet,
  createSpritesheetAnimation,
  createSpritesheetFrame,
  createSpritesheetPlayer,
  createTextureAtlas,
  defaultCanvasSpriteRenderer,
  getSpritesheetAnimation,
  getSpritesheetPlayerFrame,
  loadImageSourceFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
  setScaleX,
  setScaleY,
  setX,
  setY,
  showSpritesheetAnimation,
  SpriteKind,
  updateSpriteBeforeRender,
  updateSpritesheetPlayer,
} from '@flighthq/engine';

const SCALE = 4;
const TILE_SIZE = 32;
const FRAME_DURATION = 150;

const canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 400;
document.body.appendChild(canvas);

const source = await loadImageSourceFromURL('assets/tileset.png');
const atlas = createTextureAtlas({ image: source });
const sheet = createSpritesheet({ atlas });

const animationDefs = [
  { name: 'snail', row: 1 },
  { name: 'blob', row: 4 },
  { name: 'owl', row: 5 },
  { name: 'bug', row: 6 },
];

for (const { name, row } of animationDefs) {
  const frameIndices: number[] = [];
  for (let col = 0; col < 4; col++) {
    const atlasId = atlas.regions.length;
    addTextureAtlasRegion(atlas, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    const frameIndex = sheet.frames.length;
    sheet.frames.push(createSpritesheetFrame({ id: atlasId }));
    frameIndices.push(frameIndex);
  }
  sheet.animations[name] = createSpritesheetAnimation({
    frames: frameIndices,
    frameDuration: FRAME_DURATION,
    loop: true,
  });
}

const root = createSprite();
setScaleX(root, SCALE);
setScaleY(root, SCALE);

const spriteScreenSize = TILE_SIZE * SCALE;
const totalWidth = animationDefs.length * spriteScreenSize;
const gap = (canvas.width - totalWidth) / (animationDefs.length + 1);
const yLocal = (canvas.height - spriteScreenSize) / 2 / SCALE;

const sprites = animationDefs.map((def, i) => {
  const sprite = createSprite();
  sprite.data.atlas = atlas;
  setX(sprite, (gap + i * (spriteScreenSize + gap)) / SCALE);
  setY(sprite, yLocal);
  addChild(root, sprite);
  return sprite;
});

const players = animationDefs.map(({ name }) => {
  const player = createSpritesheetPlayer();
  showSpritesheetAnimation(player, getSpritesheetAnimation(sheet, name)!);
  return player;
});

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);

let lastTime = performance.now();

function enterFrame(time: number): void {
  const deltaTime = time - lastTime;
  lastTime = time;

  for (let i = 0; i < players.length; i++) {
    if (updateSpritesheetPlayer(players[i], deltaTime)) {
      const frame = getSpritesheetPlayerFrame(players[i], sheet);
      if (frame !== null) sprites[i].data.id = frame.id;
    }
  }

  updateSpriteBeforeRender(state, root);
  renderCanvasBackground(state);
  renderCanvasSprite(state, root);

  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
