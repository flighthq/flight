import { createCanvasElement } from '@flighthq/sdk';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

const pixelRatio = window.devicePixelRatio || 1;

export const canvas = createCanvasElement(CANVAS_WIDTH, CANVAS_HEIGHT, pixelRatio);
document.body.appendChild(canvas);

export const ctx = canvas.getContext('2d')!;

export const scale = pixelRatio;
