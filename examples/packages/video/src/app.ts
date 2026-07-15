import type { DisplayObject } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayContainer,
  createVideo,
  loadVideoResourceFromBlob,
  setVideoSource,
} from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const videoNode = createVideo();
videoNode.x = 40;
videoNode.y = 40;
addNodeChild(root, videoNode);

const secondVideoNode = createVideo();
secondVideoNode.x = 400;
secondVideoNode.y = 40;
secondVideoNode.scaleX = 1.5;
secondVideoNode.scaleY = 1.5;
secondVideoNode.alpha = 0.8;
addNodeChild(root, secondVideoNode);

const thirdVideoNode = createVideo();
thirdVideoNode.x = 200;
thirdVideoNode.y = 280;
thirdVideoNode.rotation = 10;
addNodeChild(root, thirdVideoNode);

generateVideoBlob().then(async (blob) => {
  const resource = await loadVideoResourceFromBlob(blob, {
    muted: true,
    playsInline: true,
  });

  setVideoSource(videoNode, resource);
  setVideoSource(secondVideoNode, resource);
  setVideoSource(thirdVideoNode, resource);

  if (resource.element !== null) {
    resource.element.loop = true;
    resource.element.play();
  }

  function enterFrame(): void {
    render(root as DisplayObject);
    requestAnimationFrame(enterFrame);
  }

  requestAnimationFrame(enterFrame);
});

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
      const hue = (frame * 4) % 360;
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

      frame++;
      if (frame < totalFrames) {
        requestAnimationFrame(drawFrame);
      } else {
        recorder.stop();
      }
    };

    drawFrame();
  });
}
