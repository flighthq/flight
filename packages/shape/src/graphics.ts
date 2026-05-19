import type { Graphics } from '@flighthq/types';

export function clearGraphics(graphics: Graphics): void {
  graphics.commands.length = 0;
}

export function createGraphics(): Graphics {
  return { commands: [] };
}
