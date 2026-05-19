import type { Graphics } from '@flighthq/types';

export function clearGraphics(graphics: Graphics): void {
  graphics.commands.length = 0;
}

export function copyGraphics(source: Graphics, target: Graphics): void {
  target.commands.length = 0;
  target.commands.push(...source.commands);
}

export function createGraphics(): Graphics {
  return { commands: [] };
}
