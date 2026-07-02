import type { AudioChannel } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  attachPointerInput,
  attachWindowResize,
  clearShapeCommands,
  connectSignal,
  createApplication,
  createApplicationWindow,
  createDisplayObject,
  createInputManager,
  createShape,
  createTween,
  createTweenManager,
  easeOutQuadratic,
  invalidateNodeRender,
  loadAudioResourceFromUrls,
  playAudioResource,
  setAudioChannelGain,
  startApplicationLoop,
  stopAudioChannel,
  updateTweens,
} from '@flighthq/sdk';

import { container, render, scale, setSize } from './render';

const audioContext = new AudioContext();
const manager = createTweenManager({ defaultEase: easeOutQuadratic });
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const background = createShape();
background.alpha = 0.1;
addNodeChild(root, background);

const sound = await loadAudioResourceFromUrls(audioContext, [{ url: 'assets/stars.ogg' }, { url: 'assets/stars.mp3' }]);

let channel: AudioChannel | null = null;
let playing = false;
let position = 0;

function pause(fadeOut = 1200): void {
  if (!playing || channel === null) return;

  playing = false;
  const fadingChannel = channel;

  const audioTween = createTween(manager, fadingChannel, fadeOut, { gain: 0 });
  connectSignal(audioTween.onUpdate, () => setAudioChannelGain(fadingChannel, fadingChannel.gain));
  connectSignal(audioTween.onComplete, () => {
    position = fadingChannel.currentTime;
    stopAudioChannel(fadingChannel);
    if (channel === fadingChannel) channel = null;
  });

  const backgroundTween = createTween(manager, background, fadeOut, { alpha: 0.1 });
  connectSignal(backgroundTween.onUpdate, () => invalidateNodeRender(background));
}

function play(fadeIn = 3000): void {
  if (channel !== null) {
    stopAudioChannel(channel);
    channel = null;
  }

  const nextChannel = playAudioResource(audioContext, sound, { currentTime: position, gain: fadeIn <= 0 ? 1 : 0 });
  if (nextChannel === null) return;

  channel = nextChannel;
  playing = true;

  connectSignal(nextChannel.onComplete, () => {
    playing = false;
    position = 0;
    if (channel === nextChannel) channel = null;
    background.alpha = 0.1;
    invalidateNodeRender(background);
  });

  if (fadeIn > 0) {
    const audioTween = createTween(manager, nextChannel, fadeIn, { gain: 1 });
    connectSignal(audioTween.onUpdate, () => setAudioChannelGain(nextChannel, nextChannel.gain));
  }

  const backgroundTween = createTween(manager, background, fadeIn, { alpha: 1 });
  connectSignal(backgroundTween.onUpdate, () => invalidateNodeRender(background));
}

function resize(w: number, h: number): void {
  setSize(w, h);
  clearShapeCommands(background);
  appendShapeBeginFill(background, 0x24afc4);
  appendShapeRectangle(background, 0, 0, w, h);
  invalidateNodeRender(background);
}

const win = createApplicationWindow();
connectSignal(win.onResize, () => resize(win.width, win.height));
attachWindowResize(win, container);
resize(window.innerWidth, window.innerHeight);

const input = createInputManager();
attachPointerInput(input, container);
connectSignal(input.onPointerDown, () => {
  if (playing) {
    pause();
  } else {
    play();
  }
});

play();

const app = createApplication();
connectSignal(app.onUpdate, (delta) => {
  if (channel !== null && channel.state === 'playing') {
    channel.currentTime += delta;
  }
  updateTweens(manager, delta);
});
connectSignal(app.onRender, () => {
  render(root);
});
startApplicationLoop(app);
