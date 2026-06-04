import type { VideoChannel } from '@flighthq/sdk';
import {
  addSceneChild,
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
  createText,
  createVideo,
  invalidateRender,
  loadVideoSourceFromURL,
  playVideoSource,
  startApplicationLoop,
  stopVideoChannel,
} from '@flighthq/sdk';

import { container, render, scale, setSize } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const videoSource = await loadVideoSourceFromURL('assets/example.mp4');

const videoNode = createVideo();
videoNode.data.source = videoSource;
addSceneChild(root, videoNode);

const overlay = createShape();
const prompt = createText();
prompt.data.text = 'Click to play';
prompt.data.textFormat.color = 0xffffffff;
prompt.data.textFormat.size = 24;
addSceneChild(root, overlay);
addSceneChild(root, prompt);

let channel: VideoChannel | null = null;

function play(): void {
  overlay.visible = false;
  prompt.visible = false;
  invalidateRender(overlay);
  if (channel !== null) stopVideoChannel(channel);
  channel = playVideoSource(videoSource);
  if (channel === null) return;
  connectSignal(channel.onComplete, () => {
    channel = null;
    overlay.visible = true;
    prompt.visible = true;
    invalidateRender(overlay);
  });
}

function resize(w: number, h: number): void {
  setSize(w, h);
  const el = videoSource.element;
  if (el !== null) {
    const vw = el.videoWidth || w;
    const vh = el.videoHeight || h;
    const fit = Math.min(w / vw, h / vh);
    videoNode.x = Math.round((w - vw * fit) / 2);
    videoNode.y = Math.round((h - vh * fit) / 2);
    videoNode.scaleX = fit;
    videoNode.scaleY = fit;
  }
  clearShapeCommands(overlay.data);
  appendShapeBeginFill(overlay, 0x000000, 0.5);
  appendShapeRectangle(overlay, 0, 0, w, h);
  prompt.x = Math.round(w / 2 - 60);
  prompt.y = Math.round(h / 2 - 12);
  invalidateRender(videoNode);
  invalidateRender(overlay);
  invalidateRender(prompt);
}

const win = createApplicationWindow();
connectSignal(win.onResize, () => resize(win.width, win.height));
attachWindowResize(win, container);
resize(window.innerWidth, window.innerHeight);

const input = createInputManager();
attachPointerInput(input, container);
connectSignal(input.onPointerDown, () => play());

const app = createApplication();
connectSignal(app.onUpdate, () => {
  if (channel !== null && channel.state === 'playing') invalidateRender(videoNode);
});
connectSignal(app.onRender, () => {
  render(root);
});
startApplicationLoop(app);
