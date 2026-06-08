import {
  addSceneChild,
  addTextureAtlasRegion,
  connectSignal,
  createApplication,
  createSprite,
  createSpritesheet,
  createSpritesheetAnimation,
  createSpritesheetFrame,
  createSpritesheetPlayer,
  createTextureAtlas,
  getSpritesheetAnimation,
  getSpritesheetPlayerFrame,
  invalidateAppearance,
  loadImageSourceFromURL,
  playSpritesheetAnimation,
  setTransformX,
  setTransformY,
  startApplicationLoop,
  updateSpritesheetPlayer,
} from '@flighthq/sdk';

import { render, scale } from './render';

const SCALE = 4;
const TILE_SIZE = 32;
const FRAME_DURATION = 150;
const STAGE_WIDTH = 800;
const STAGE_HEIGHT = 400;

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
root.scaleX = SCALE * scale;
root.scaleY = SCALE * scale;

const spriteScreenSize = TILE_SIZE * SCALE;
const totalWidth = animationDefs.length * spriteScreenSize;
const gap = (STAGE_WIDTH - totalWidth) / (animationDefs.length + 1);
const yLocal = (STAGE_HEIGHT - spriteScreenSize) / 2 / SCALE;

const sprites = animationDefs.map((def, i) => {
  const sprite = createSprite();
  sprite.data.atlas = atlas;
  setTransformX(sprite, (gap + i * (spriteScreenSize + gap)) / SCALE);
  setTransformY(sprite, yLocal);
  addSceneChild(root, sprite);
  return sprite;
});

const players = animationDefs.map(({ name }) => {
  const player = createSpritesheetPlayer();
  playSpritesheetAnimation(player, getSpritesheetAnimation(sheet, name)!);
  return player;
});

const app = createApplication();
connectSignal(app.onUpdate, (delta) => {
  for (let i = 0; i < players.length; i++) {
    if (updateSpritesheetPlayer(players[i], delta)) {
      const frame = getSpritesheetPlayerFrame(players[i], sheet);
      if (frame !== null) {
        sprites[i].data.id = frame.id;
        invalidateAppearance(sprites[i]);
      }
    }
  }
});
connectSignal(app.onRender, () => {
  render(root);
});
startApplicationLoop(app);
