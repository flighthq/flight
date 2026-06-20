import type { Surface } from '@flighthq/types';

/**
 * Returns the fraction of pixels (0..1) that differ from `backgroundColor` by more than
 * `channelTolerance` on at least one RGBA channel. This is the "did anything render" signal: a blank
 * frame (the whole surface still the clear colour, or fully transparent) returns ~0; a populated
 * frame returns a meaningful fraction. `backgroundColor` is a packed 0xRRGGBBAA value — pass the
 * render state's clear colour. `channelTolerance` (0..255) absorbs antialiasing fringe around the
 * cleared edges so a genuinely empty frame does not creep above zero.
 */
export function getSurfaceCoverage(
  source: Readonly<Surface>,
  backgroundColor: number,
  channelTolerance: number = 0,
): number {
  const br = (backgroundColor >>> 24) & 0xff;
  const bg = (backgroundColor >> 16) & 0xff;
  const bb = (backgroundColor >> 8) & 0xff;
  const ba = backgroundColor & 0xff;
  const data = source.data;
  const totalPixels = source.width * source.height;
  if (totalPixels === 0) return 0;

  let covered = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - br) > channelTolerance ||
      Math.abs(data[i + 1] - bg) > channelTolerance ||
      Math.abs(data[i + 2] - bb) > channelTolerance ||
      Math.abs(data[i + 3] - ba) > channelTolerance
    ) {
      covered++;
    }
  }
  return covered / totalPixels;
}
