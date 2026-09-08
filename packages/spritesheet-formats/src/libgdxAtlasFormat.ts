import type { SpritesheetData, SpritesheetFrameData } from '@flighthq/types/contract';

function appendLibgdxAtlasFrame(lines: string[], frame: Readonly<SpritesheetFrameData>): void {
  const packedWidth = frame.rotated ? frame.height : frame.width;
  const packedHeight = frame.rotated ? frame.width : frame.height;
  lines.push(
    frame.name,
    `  rotate: ${frame.rotated}`,
    `  xy: ${frame.x}, ${frame.y}`,
    `  size: ${packedWidth}, ${packedHeight}`,
    `  orig: ${frame.sourceWidth}, ${frame.sourceHeight}`,
    `  offset: ${frame.offsetX}, ${frame.offsetY}`,
    '  index: -1',
  );
}

// Formats the single-page subset represented by SpritesheetData as a libGDX text atlas. libGDX has
// no animation records, so the frame names remain the round-trip carrier for the parser's
// `baseName_NNN` inference. Page sampling fields use the package's stable defaults because
// SpritesheetData does not model them.
export function formatLibgdxAtlas(data: Readonly<SpritesheetData>): string {
  const lines = [
    data.imageFile,
    `  size: ${data.imageWidth}, ${data.imageHeight}`,
    '  format: RGBA8888',
    '  filter: Linear, Linear',
    '  repeat: none',
  ];
  for (const frame of data.frames) appendLibgdxAtlasFrame(lines, frame);
  return `${lines.join('\n')}\n`;
}
