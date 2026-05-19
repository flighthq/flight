import {
  addChild,
  addTextureAtlasRegion,
  createCanvasRenderState,
  createSprite,
  createTextureAtlas,
  defaultCanvasSpriteRenderer,
  loadImageSourceFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
  setScaleX,
  setScaleY,
  setX,
  setY,
  SpriteKind,
  updateSpriteBeforeRender,
} from '@flighthq/engine';

const SCALE = 4;
const TILE_SIZE = 32;

const canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 400;
document.body.appendChild(canvas);

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
setScaleX(root, SCALE);
setScaleY(root, SCALE);

const creatureIDs = [gumdropID, balloonID, robotID, compyID];

const spriteScreenSize = TILE_SIZE * SCALE;
const totalWidth = creatureIDs.length * spriteScreenSize;
const gap = (canvas.width - totalWidth) / (creatureIDs.length + 1);
const yLocal = (canvas.height - spriteScreenSize) / 2 / SCALE;

for (let i = 0; i < creatureIDs.length; i++) {
  const sprite = createSprite();
  sprite.data.atlas = atlas;
  sprite.data.id = creatureIDs[i];
  setX(sprite, (gap + i * (spriteScreenSize + gap)) / SCALE);
  setY(sprite, yLocal);
  addChild(root, sprite);
}

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);

function enterFrame(): void {
  if (updateSpriteBeforeRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasSprite(state, root);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
