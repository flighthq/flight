import type { HostProbeResult } from './contract';

export function runHostProbeRender(): HostProbeResult {
  const canvas = document.createElement('canvas');
  canvas.id = 'render-proof';
  canvas.width = 96;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context === null) {
    return { detail: 'Canvas 2D context unavailable', id: 'render.canvas', kind: 'render', status: 'fail' };
  }
  context.fillStyle = '#17324d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#39d98a';
  context.fillRect(16, 12, 64, 40);
  document.getElementById('render-target')?.appendChild(canvas);
  const pixel = context.getImageData(32, 24, 1, 1).data;
  const passed = pixel[0] === 57 && pixel[1] === 217 && pixel[2] === 138 && pixel[3] === 255;
  return {
    detail: passed ? 'Canvas draw and readback matched' : `Unexpected pixel ${[...pixel].join(',')}`,
    id: 'render.canvas',
    kind: 'render',
    status: passed ? 'pass' : 'fail',
  };
}
