import {
  addChild,
  addTextureAtlasRegion,
  createSprite,
  createTextureAtlas,
  loadImageSourceFromURL,
  setX,
  setY,
  updateSpriteBeforeRender,
} from '@flighthq/engine';

import { render, scale, state } from './render';

const SCALE = 4;
const TILE_SIZE = 32;
const STAGE_WIDTH = 800;
const STAGE_HEIGHT = 400;

const source = await loadImageSourceFromURL('assets/tileset.png');

const atlas = createTextureAtlas({ image: source });

function addRegion(y: number): number {
  const id = atlas.regions.length;
  addTextureAtlasRegion(atlas, 0, y, TILE_SIZE, TILE_SIZE);
  return id;
}

const gumdropID = addRegion(0);
const balloonID = addRegion(64);
const robotID = addRegion(96);
const compyID = addRegion(224);

const root = createSprite();
root.scaleX = SCALE * scale;
root.scaleY = SCALE * scale;

const creatureIDs = [gumdropID, balloonID, robotID, compyID];

const spriteScreenSize = TILE_SIZE * SCALE;
const totalWidth = creatureIDs.length * spriteScreenSize;
const gap = (STAGE_WIDTH - totalWidth) / (creatureIDs.length + 1);
const yLocal = (STAGE_HEIGHT - spriteScreenSize) / 2 / SCALE;

for (let i = 0; i < creatureIDs.length; i++) {
  const sprite = createSprite();
  sprite.data.atlas = atlas;
  sprite.data.id = creatureIDs[i];
  setX(sprite, (gap + i * (spriteScreenSize + gap)) / SCALE);
  setY(sprite, yLocal);
  addChild(root, sprite);
}

function enterFrame(): void {
  if (updateSpriteBeforeRender(state, root)) {
    render(root);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
