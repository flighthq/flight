import {
  createCanvasRenderState,
  createTilemap,
  defaultCanvasTilemapRenderer,
  loadTilesetFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
  setTile,
  setX,
  setY,
  TilemapKind,
  updateSpriteBeforeRender,
} from '@flighthq/engine';

const TILE_W = 32;
const TILE_H = 32;
const COLS = 8;
const ROWS = 8;
const SCALE = 2;
const PAD = 40;

const mapW = COLS * TILE_W * SCALE;
const mapH = ROWS * TILE_H * SCALE;

const canvas = document.createElement('canvas');
canvas.width = mapW + PAD * 2;
canvas.height = mapH + PAD * 2;
document.getElementById('app')!.appendChild(canvas);

const tileset = await loadTilesetFromURL('assets/tileset.png', TILE_W, TILE_H);

const tilemap = createTilemap({ data: { columns: COLS, rows: ROWS, tileset } });
tilemap.scaleX = SCALE;
tilemap.scaleY = SCALE;
setX(tilemap, PAD);
setY(tilemap, PAD);

// Each row shows the idle frame of one character.
// Character n's first frame = n * tileset.columns (row-major stride).
const stride = tileset.columns;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    setTile(tilemap, c, r, r * stride);
  }
}

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  contextAttributes: { alpha: false },
  imageSmoothingEnabled: false,
});
registerRenderer(state, TilemapKind, defaultCanvasTilemapRenderer);

function enterFrame(): void {
  if (updateSpriteBeforeRender(state, tilemap)) {
    renderCanvasBackground(state);
    renderCanvasSprite(state, tilemap);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
