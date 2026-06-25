// video-frame — validates the Video display object render path: a Video node draws its VideoResource's current
// frame, sized to the element's videoWidth/videoHeight, through each backend's video renderer (Canvas
// drawImage, WebGL texImage2D, WebGPU copyExternalImageToTexture, DOM element append).
//
// Real video DECODING is the browser's job, not Flight's, and is non-deterministic headless. What this
// test exercises is Flight's pipeline: the frame source is a canvas painted with two known halves (red |
// blue) and given the videoWidth/videoHeight/readyState a video element exposes, so every backend uploads
// and draws a deterministic, known frame. (This mirrors how video.test.ts stands in a fake element.) The
// oracle samples each half — a renderer that ignored the source, mis-sized it, or skipped the frame fails.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayContainer,
  createVideo,
  createVideoResource,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  VideoKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const FRAME_W = 200;
const FRAME_H = 120;
const VIDEO_X = 300;
const VIDEO_Y = 240;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [VideoKind],
});

// A canvas painted with a known frame (left half red, right half blue), standing in as the video element:
// the video renderers read element.videoWidth/videoHeight/readyState and upload the element as a texture,
// all of which a canvas can provide. drawImage/texImage2D/copyExternalImageToTexture all accept a canvas.
const frame = document.createElement('canvas');
frame.width = FRAME_W;
frame.height = FRAME_H;
const fctx = frame.getContext('2d')!;
fctx.fillStyle = 'rgb(255,0,0)';
fctx.fillRect(0, 0, FRAME_W / 2, FRAME_H);
fctx.fillStyle = 'rgb(0,0,255)';
fctx.fillRect(FRAME_W / 2, 0, FRAME_W / 2, FRAME_H);
Object.defineProperty(frame, 'videoWidth', { value: FRAME_W });
Object.defineProperty(frame, 'videoHeight', { value: FRAME_H });
Object.defineProperty(frame, 'readyState', { value: 2 }); // HAVE_CURRENT_DATA — a frame is available

const root = createDisplayContainer();

const videoNode = createVideo();
videoNode.data.source = createVideoResource(frame as unknown as HTMLVideoElement);
videoNode.data.smoothing = false;
videoNode.x = VIDEO_X;
videoNode.y = VIDEO_Y;
invalidateNodeLocalTransform(videoNode);
addNodeChild(root, videoNode);

render(root);

export function assertRender(frameSurface: Readonly<Surface>): void {
  const s = frameSurface.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frameSurface, Math.round(x * s), Math.round(y * s));

  // Left half of the frame is red.
  const left = at(VIDEO_X + FRAME_W / 4, VIDEO_Y + FRAME_H / 2);
  if (!isRed(left)) {
    throw new Error(`[video-frame] left half of video frame not red — got #${hex(left)}`);
  }
  // Right half is blue.
  const right = at(VIDEO_X + (FRAME_W * 3) / 4, VIDEO_Y + FRAME_H / 2);
  if (!isBlue(right)) {
    throw new Error(`[video-frame] right half of video frame not blue — got #${hex(right)}`);
  }
  // Outside the video bounds is background.
  const outside = at(VIDEO_X - 60, VIDEO_Y - 60);
  if (!isBackground(outside)) {
    throw new Error(`[video-frame] area outside the video not background — got #${hex(outside)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 80 && channel(rgb, 0) < 80;
}
function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 180 && channel(rgb, 16) < 80 && channel(rgb, 8) < 80;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
