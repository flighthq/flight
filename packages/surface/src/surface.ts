import { createEntity } from '@flighthq/entity';
import type { Surface } from '@flighthq/types';

export function cloneSurface(source: Readonly<Surface>): Surface {
  return createEntity({
    alphaType: source.alphaType,
    colorSpace: source.colorSpace,
    data: new Uint8ClampedArray(source.data),
    format: source.format,
    height: source.height,
    source: null,
    version: 0,
    width: source.width,
  });
}

export function createSurface(width: number, height: number, color: number = 0): Surface {
  const data = new Uint8ClampedArray(width * height * 4);
  if (color !== 0) {
    const r = (color >>> 24) & 0xff;
    const g = (color >> 16) & 0xff;
    const b = (color >> 8) & 0xff;
    const a = color & 0xff;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return createEntity({
    alphaType: 'straight',
    colorSpace: 'srgb' as const,
    data,
    format: 'rgba8unorm',
    height,
    source: null,
    version: 0,
    width,
  });
}
