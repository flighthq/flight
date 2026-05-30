import {
  addGraphChild,
  createAudioSourceFromURLs,
  createBitmap,
  createDisplayObject,
  createTweenManager,
  invalidateRender,
  loadAudioSourceFromURLs,
  loadFontFromURL,
  loadImageSourceFromURL,
  updateDisplayObjectBeforeRender,
  updateTweens,
} from '@flighthq/sdk';

import { PiratePigGame } from './game';
import { container, render, scale, setSize, state } from './render';

// ── Assets ─────────────────────────────────────────────────────────────────

const [bgImage, footerImage, logoImage, font, theme, ...tileImages] = await Promise.all([
  loadImageSourceFromURL('assets/images/background_tile.png'),
  loadImageSourceFromURL('assets/images/center_bottom.png'),
  loadImageSourceFromURL('assets/images/logo.png'),
  loadFontFromURL('assets/fonts/FreebooterUpdated.ttf', 'FreebooterUpdated'),
  loadAudioSourceFromURLs([{ url: 'assets/sounds/theme.ogg' }, { url: 'assets/sounds/theme.mp3' }]),
  loadImageSourceFromURL('assets/images/game_bear.png'),
  loadImageSourceFromURL('assets/images/game_bunny_02.png'),
  loadImageSourceFromURL('assets/images/game_carrot.png'),
  loadImageSourceFromURL('assets/images/game_lemon.png'),
  loadImageSourceFromURL('assets/images/game_panda.png'),
  loadImageSourceFromURL('assets/images/game_piratePig.png'),
]);

const sounds = [
  theme,
  createAudioSourceFromURLs([{ url: 'assets/sounds/sound3.ogg' }, { url: 'assets/sounds/sound3.mp3' }]),
  createAudioSourceFromURLs([{ url: 'assets/sounds/sound4.ogg' }, { url: 'assets/sounds/sound4.mp3' }]),
  createAudioSourceFromURLs([{ url: 'assets/sounds/sound5.ogg' }, { url: 'assets/sounds/sound5.mp3' }]),
];

// ── Scene ──────────────────────────────────────────────────────────────────

const manager = createTweenManager();
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const background = createBitmap();
background.data.image = bgImage;
background.data.smoothing = true;
addGraphChild(root, background);

const footer = createBitmap();
footer.data.image = footerImage;
footer.data.smoothing = true;
addGraphChild(root, footer);

const game = new PiratePigGame(manager, tileImages, logoImage, font.name, sounds);

const logo = createBitmap();
logo.data.image = logoImage;
logo.data.smoothing = true;
addGraphChild(game.obj, logo);

addGraphChild(root, game.obj);

// ── Layout ─────────────────────────────────────────────────────────────────

function resize(w: number, h: number): void {
  setSize(w, h);

  background.scaleX = w / bgImage.width;
  background.scaleY = h / bgImage.height;
  invalidateRender(background);

  game.resize(w, h);

  footer.scaleX = game.currentScale;
  footer.scaleY = game.currentScale;
  footer.x = w / 2 - (footerImage.width * footer.scaleX) / 2;
  footer.y = h - footerImage.height * footer.scaleY;
  invalidateRender(footer);
}

resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => resize(window.innerWidth, window.innerHeight));

// ── Game start ─────────────────────────────────────────────────────────────

game.newGame();

// ── Pointer input ──────────────────────────────────────────────────────────

let dragStartX = 0;
let dragStartY = 0;
let selectedTile = game.hitTileAtStageXY(-1, -1);

container.addEventListener('pointerdown', (e: PointerEvent) => {
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  selectedTile = game.hitTileAtStageXY(e.clientX, e.clientY);
});

container.addEventListener('pointerup', (e: PointerEvent) => {
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
    game.swapTile(selectedTile, targetRow, targetCol);
  }

  selectedTile = null;
});

// ── Render loop ────────────────────────────────────────────────────────────

let lastTime = 0;

function enterFrame(time: number): void {
  const delta = lastTime === 0 ? 0 : time - lastTime;
  lastTime = time;

  updateTweens(manager, delta);
  game.onEnterFrame();

  if (updateDisplayObjectBeforeRender(state, root)) {
    render(root);
  }

  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
