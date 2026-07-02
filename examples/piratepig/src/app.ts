import {
  addNodeChild,
  attachPointerInput,
  attachWindowResize,
  attachWindowVisibility,
  connectInputToInteraction,
  connectSignal,
  createApplication,
  createApplicationWindow,
  createBitmap,
  createDisplayObject,
  createInputManager,
  createInteractionManager,
  createTweenManager,
  DisplayObjectKind,
  hitTestGraphLocalBounds,
  invalidateNodeRender,
  loadAudioResourceFromUrls,
  loadFontFromUrl,
  loadImageResourceFromUrl,
  registerHitTestPoint,
  startApplicationLoop,
  stopApplicationLoop,
  updateTweens,
} from '@flighthq/sdk';

import { PiratePigGame } from './game';
import { applyBackgroundBlur, container, render, scale, setSize } from './render';

// ── Assets ─────────────────────────────────────────────────────────────────

const audioContext = new AudioContext();

const [bgImage, footerImage, logoImage, font, theme, ...tileImages] = await Promise.all([
  loadImageResourceFromUrl('assets/images/background_tile.png'),
  loadImageResourceFromUrl('assets/images/center_bottom.png'),
  loadImageResourceFromUrl('assets/images/logo.png'),
  loadFontFromUrl('assets/fonts/FreebooterUpdated.ttf', 'FreebooterUpdated'),
  loadAudioResourceFromUrls(audioContext, [{ url: 'assets/sounds/theme.ogg' }, { url: 'assets/sounds/theme.mp3' }]),
  loadImageResourceFromUrl('assets/images/game_bear.png'),
  loadImageResourceFromUrl('assets/images/game_bunny_02.png'),
  loadImageResourceFromUrl('assets/images/game_carrot.png'),
  loadImageResourceFromUrl('assets/images/game_lemon.png'),
  loadImageResourceFromUrl('assets/images/game_panda.png'),
  loadImageResourceFromUrl('assets/images/game_piratePig.png'),
]);

const sounds = [theme];

// ── Scene ──────────────────────────────────────────────────────────────────

registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);

const manager = createTweenManager();
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const background = createBitmap();
background.data.image = bgImage;
background.data.smoothing = true;
addNodeChild(root, background);

const footer = createBitmap();
footer.data.image = footerImage;
footer.data.smoothing = true;
addNodeChild(root, footer);

const interactionManager = createInteractionManager(root);
const game = new PiratePigGame(audioContext, manager, interactionManager, tileImages, logoImage, font.name, sounds, {
  coordScale: scale,
  cursorElement: container,
});

const logo = createBitmap();
logo.data.image = logoImage;
logo.data.smoothing = true;
addNodeChild(game.obj, logo);

addNodeChild(root, game.obj);

// Blur the white score panel (OpenFL: Background.filters = [new BlurFilter(10, 10)]).
const refreshBackgroundBlur = applyBackgroundBlur(game.backgroundPanel);

// ── Layout ─────────────────────────────────────────────────────────────────

function resize(w: number, h: number): void {
  setSize(w, h);

  background.scaleX = w / bgImage.width;
  background.scaleY = h / bgImage.height;
  invalidateNodeRender(background);

  game.resize(w, h);

  footer.scaleX = game.currentScale;
  footer.scaleY = game.currentScale;
  footer.x = w / 2 - (footerImage.width * footer.scaleX) / 2;
  footer.y = h - footerImage.height * footer.scaleY;
  invalidateNodeRender(footer);

  // Re-bake the cached background blur for the new layout (a no-op on the CSS-filter backends).
  refreshBackgroundBlur();
}

const win = createApplicationWindow();
connectSignal(win.onResize, () => resize(win.width, win.height));
connectSignal(win.onDeactivate, () => stopApplicationLoop(app));
connectSignal(win.onActivate, () => startApplicationLoop(app));
attachWindowResize(win, container);
attachWindowVisibility(win);
resize(window.innerWidth, window.innerHeight);

// ── Game start ─────────────────────────────────────────────────────────────

game.newGame();

// ── Input ──────────────────────────────────────────────────────────────────

const inputManager = createInputManager();
attachPointerInput(inputManager, container);
connectInputToInteraction(inputManager, interactionManager, scale);

// ── Render loop ────────────────────────────────────────────────────────────

const app = createApplication();
connectSignal(app.onUpdate, (delta) => {
  updateTweens(manager, delta);
  game.onEnterFrame();
});
connectSignal(app.onRender, () => {
  render(root);
});
startApplicationLoop(app);
