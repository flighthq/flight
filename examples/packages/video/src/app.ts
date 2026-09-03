import { webVideoCapabilityBackend } from '@flighthq/host-web';
import type { Node2D, VideoChannel, VideoResource } from '@flighthq/sdk';
import {
  addNodeChild,
  advanceVideoTexture,
  createDisplayObject,
  createSprite,
  createVideoTexture,
  createVideoResource,
  invalidateNodeAppearance,
  loadVideoResourceFromBlob,
  playVideoResource,
  setVideoChannelGain,
  setVideoChannelPlaybackRate,
} from '@flighthq/sdk';

import { render, scale } from './render';

const captureWindow = window as typeof window & { __flightCapture?: boolean };
const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const videoNode = createSprite();
videoNode.x = 40;
videoNode.y = 40;
addNodeChild(root, videoNode);

const secondVideoNode = createSprite();
secondVideoNode.x = 400;
secondVideoNode.y = 40;
secondVideoNode.scaleX = 1.5;
secondVideoNode.scaleY = 1.5;
secondVideoNode.alpha = 0.8;
addNodeChild(root, secondVideoNode);

const thirdVideoNode = createSprite();
thirdVideoNode.x = 200;
thirdVideoNode.y = 280;
thirdVideoNode.rotation = 10;
addNodeChild(root, thirdVideoNode);

const videoChannels: VideoChannel[] = [];

function startVideoChannels(resources: readonly VideoResource[]): void {
  for (let i = 0; i < resources.length; i++) {
    const channel = playVideoResource(resources[i], { loops: -1 });
    if (channel === null) throw new Error(`Unable to play video channel ${i + 1}`);
    setVideoChannelGain(channel, i === 0 ? 1 : 0);
    setVideoChannelPlaybackRate(channel, 0.75 + i * 0.25);
    videoChannels.push(channel);
  }
}

function createCaptureVideoResource(): ReturnType<typeof createVideoResource> {
  const width = 320;
  const height = 240;
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = height;
  drawVideoFrame(frame.getContext('2d')!, width, height, 5);
  Object.defineProperty(frame, 'videoWidth', { value: width });
  Object.defineProperty(frame, 'videoHeight', { value: height });
  Object.defineProperty(frame, 'readyState', { value: 2 });
  return createVideoResource(frame as unknown as HTMLVideoElement);
}

function drawVideoFrame(ctx: CanvasRenderingContext2D, width: number, height: number, frame: number): void {
  // Keep the generated clip in a calm blue-violet palette. A slow sinusoidal drift still proves
  // that successive video frames update without the previous full hue-wheel flash every 90 frames.
  const hue = 218 + Math.sin(frame * 0.025) * 18;
  ctx.fillStyle = `hsl(${hue}, 70%, 30%)`;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  const barX = (frame * 3) % width;
  ctx.fillRect(barX, 60, 30, 120);

  ctx.fillStyle = `hsl(${(hue + 180) % 360}, 80%, 60%)`;
  const circleX = width / 2 + Math.cos(frame * 0.1) * 80;
  const circleY = height / 2 + Math.sin(frame * 0.1) * 40;
  ctx.beginPath();
  ctx.arc(circleX, circleY, 25, 0, Math.PI * 2);
  ctx.fill();
}

function enterFrame(): void {
  renderFrame();
  requestAnimationFrame(enterFrame);
}

function renderFrame(): void {
  for (const texture of videoTextures) advanceVideoTexture(texture);
  invalidateNodeAppearance(videoNode);
  invalidateNodeAppearance(secondVideoNode);
  invalidateNodeAppearance(thirdVideoNode);
  render(root as Node2D);
}

function setVideoSources(
  resource1: Parameters<typeof createVideoTexture>[0],
  resource2: Parameters<typeof createVideoTexture>[0],
  resource3: Parameters<typeof createVideoTexture>[0],
): void {
  const texture1 = createVideoTexture(resource1);
  const texture2 = createVideoTexture(resource2);
  const texture3 = createVideoTexture(resource3);
  videoTextures.push(texture1, texture2, texture3);
  videoNode.data.texture = texture1;
  secondVideoNode.data.texture = texture2;
  thirdVideoNode.data.texture = texture3;
}

const videoTextures: ReturnType<typeof createVideoTexture>[] = [];

function generateVideoBlob(): Promise<Blob> {
  const width = 320;
  const height = 240;
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;
  const stream = offscreen.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };

    recorder.start();
    let frame = 0;
    const totalFrames = 90;

    const drawFrame = (): void => {
      drawVideoFrame(ctx, width, height, frame);

      frame++;
      if (frame < totalFrames) requestAnimationFrame(drawFrame);
      else recorder.stop();
    };

    drawFrame();
  });
}

if (captureWindow.__flightCapture === true) {
  setVideoSources(createCaptureVideoResource(), createCaptureVideoResource(), createCaptureVideoResource());
  renderFrame();
} else {
  generateVideoBlob().then(async (blob) => {
    const opts = { muted: true, playsInline: true } as const;
    const [resource1, resource2, resource3] = await Promise.all([
      loadVideoResourceFromBlob(webVideoCapabilityBackend, blob, opts),
      loadVideoResourceFromBlob(webVideoCapabilityBackend, blob, opts),
      loadVideoResourceFromBlob(webVideoCapabilityBackend, blob, opts),
    ]);

    setVideoSources(resource1, resource2, resource3);
    startVideoChannels([resource1, resource2, resource3]);

    requestAnimationFrame(enterFrame);
  });
}
