import {
  addSceneChild,
  attachPointerInput,
  attachWindowResize,
  attachWindowVisibility,
  connectInputToInteraction,
  connectSignal,
  createApplication,
  createApplicationWindow,
  createAudioSourceFromURLs,
  createBitmap,
  createDisplayObject,
  createInputManager,
  createInteractionManager,
  createTweenManager,
  DisplayObjectKind,
  graphHitTestLocalBounds,
  invalidateRender,
  loadAudioSourceFromURLs,
  loadFontFromURL,
  loadImageSourceFromURL,
  registerHitTestPoint,
  startApplicationLoop,
  stopApplicationLoop,
  updateDisplayObject,
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

registerHitTestPoint(DisplayObjectKind, graphHitTestLocalBounds);

const manager = createTweenManager();
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const background = createBitmap();
background.data.image = bgImage;
background.data.smoothing = true;
addSceneChild(root, background);

const footer = createBitmap();
footer.data.image = footerImage;
footer.data.smoothing = true;
addSceneChild(root, footer);

const interactionManager = createInteractionManager(root);
const game = new PiratePigGame(manager, interactionManager, tileImages, logoImage, font.name, sounds, {
  coordScale: scale,
  cursorElement: container,
});

const logo = createBitmap();
logo.data.image = logoImage;
logo.data.smoothing = true;
addSceneChild(game.obj, logo);

addSceneChild(root, game.obj);

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
  if (updateDisplayObject(state, root)) {
    render(root);
  }
});
startApplicationLoop(app);
