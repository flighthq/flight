import {
  addChild,
  BitmapKind,
  createBitmap,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  createTweenManager,
  defaultCanvasBitmapRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasTextRenderer,
  invalidateRender,
  loadFontFromURL,
  loadImageSourceFromURL,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
  TextKind,
  updateDisplayObjectBeforeRender,
  updateTweens,
} from '@flighthq/engine';

import { createPiratePigGame, hitTileAtStageXY, newGame, onEnterFrame, resizeGame, swapTile } from './game';

// ── Assets ─────────────────────────────────────────────────────────────────

const TILE_PATHS = [
  'assets/images/game_bear.png',
  'assets/images/game_bunny_02.png',
  'assets/images/game_carrot.png',
  'assets/images/game_lemon.png',
  'assets/images/game_panda.png',
  'assets/images/game_piratePig.png',
];

const [bgImage, footerImage, logoImage, font, ...tileImages] = await Promise.all([
  loadImageSourceFromURL('assets/images/background_tile.png'),
  loadImageSourceFromURL('assets/images/center_bottom.png'),
  loadImageSourceFromURL('assets/images/logo.png'),
  loadFontFromURL('assets/fonts/FreebooterUpdated.ttf', 'FreebooterUpdated'),
  ...TILE_PATHS.map((p) => loadImageSourceFromURL(p)),
]);

function loadAudio(path: string): HTMLAudioElement {
  const el = new Audio(path);
  el.preload = 'auto';
  return el;
}

const sounds = [
  loadAudio('assets/sounds/theme.ogg'),
  loadAudio('assets/sounds/sound3.ogg'),
  loadAudio('assets/sounds/sound4.ogg'),
  loadAudio('assets/sounds/sound5.ogg'),
];

// ── Canvas + renderer ──────────────────────────────────────────────────────

const dpr = window.devicePixelRatio || 1;
const canvas = createCanvasElement(window.innerWidth, window.innerHeight, dpr);
document.body.appendChild(canvas);

const renderState = createCanvasRenderState(canvas, {
  backgroundColor: 0x000000ff,
  contextAttributes: { alpha: false },
});
registerRenderer(renderState, BitmapKind, defaultCanvasBitmapRenderer);
registerRenderer(renderState, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(renderState, TextKind, defaultCanvasTextRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

// ── Scene ──────────────────────────────────────────────────────────────────

const manager = createTweenManager();
const root = createDisplayObject();

// Stretched background image
const background = createBitmap();
background.data.image = bgImage;
background.data.smoothing = true;
addChild(root, background);

// Footer bar sits behind game in z-order
const footer = createBitmap();
footer.data.image = footerImage;
footer.data.smoothing = true;
addChild(root, footer);

// Game
const game = createPiratePigGame(manager, tileImages, logoImage, font.name, sounds);

// Logo (first child of game container, behind score and tiles)
const logo = createBitmap();
logo.data.image = logoImage;
logo.data.smoothing = true;
addChild(game.obj, logo);

addChild(root, game.obj);

// ── Layout ─────────────────────────────────────────────────────────────────

function resize(w: number, h: number): void {
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  root.scaleX = dpr;
  root.scaleY = dpr;

  background.scaleX = w / bgImage.width;
  background.scaleY = h / bgImage.height;
  invalidateRender(background);

  resizeGame(game, w, h);

  footer.scaleX = game.currentScale;
  footer.scaleY = game.currentScale;
  footer.x = w / 2 - (footerImage.width * footer.scaleX) / 2;
  footer.y = h - footerImage.height * footer.scaleY;
  invalidateRender(footer);
}

resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => resize(window.innerWidth, window.innerHeight));

// ── Game start ─────────────────────────────────────────────────────────────

newGame();

// ── Pointer input ──────────────────────────────────────────────────────────

let dragStartX = 0;
let dragStartY = 0;
let selectedTile = hitTileAtStageXY(-1, -1);

canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  selectedTile = hitTileAtStageXY(e.clientX, e.clientY);
});

canvas.addEventListener('pointerup', (e: PointerEvent) => {
  if (selectedTile === null || selectedTile.moving) return;

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    let targetRow = selectedTile.row;
    let targetCol = selectedTile.column;
    if (Math.abs(dx) > Math.abs(dy)) {
      targetCol += dx < 0 ? -1 : 1;
    } else {
      targetRow += dy < 0 ? -1 : 1;
    }
    swapTile(selectedTile, targetRow, targetCol);
  }

  selectedTile = null;
});

// ── Render loop ────────────────────────────────────────────────────────────

let lastTime = 0;

function enterFrame(time: number): void {
  const delta = lastTime === 0 ? 0 : time - lastTime;
  lastTime = time;

  updateTweens(manager, delta);
  onEnterFrame();

  if (updateDisplayObjectBeforeRender(renderState, root)) {
    renderCanvasBackground(renderState);
    renderCanvasDisplayObject(renderState, root);
  }

  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
