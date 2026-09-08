import { formatLibgdxAtlas } from './libgdxAtlasFormat';
import { parseLibgdxAtlasSpritesheet } from './libgdxAtlasParse';

const ROUND_TRIP_ATLAS = `atlas.png
  size: 256, 128
  format: RGBA8888
  filter: Nearest, Linear
  repeat: x
idle_0
  rotate: false
  xy: 2, 4
  size: 28, 30
  orig: 32, 36
  offset: 1, 3
  index: -1
idle_1
  rotate: true
  xy: 40, 6
  size: 18, 42
  orig: 42, 18
  offset: 0, 0
  index: -1
`;

function frameFacts(text: string): readonly object[] {
  return parseLibgdxAtlasSpritesheet(text).frames.map((frame) => ({
    height: frame.height,
    name: frame.name,
    offsetX: frame.offsetX,
    offsetY: frame.offsetY,
    rotated: frame.rotated,
    sourceHeight: frame.sourceHeight,
    sourceWidth: frame.sourceWidth,
    width: frame.width,
    x: frame.x,
    y: frame.y,
  }));
}

describe('formatLibgdxAtlas', () => {
  it('emits a complete single-page atlas with stable sampling defaults', () => {
    const formatted = formatLibgdxAtlas(parseLibgdxAtlasSpritesheet(ROUND_TRIP_ATLAS));
    expect(formatted).toContain('atlas.png\n  size: 256, 128');
    expect(formatted).toContain('  format: RGBA8888');
    expect(formatted).toContain('  filter: Linear, Linear');
    expect(formatted).toContain('  repeat: none');
    expect(formatted.endsWith('\n')).toBe(true);
  });

  it('round-trips page and frame facts through parse, format, and parse', () => {
    const first = parseLibgdxAtlasSpritesheet(ROUND_TRIP_ATLAS);
    const formatted = formatLibgdxAtlas(first);
    const second = parseLibgdxAtlasSpritesheet(formatted);

    expect({
      imageFile: second.imageFile,
      imageHeight: second.imageHeight,
      imageWidth: second.imageWidth,
      scale: second.scale,
    }).toEqual({
      imageFile: first.imageFile,
      imageHeight: first.imageHeight,
      imageWidth: first.imageWidth,
      scale: first.scale,
    });
    expect(frameFacts(formatted)).toEqual(frameFacts(ROUND_TRIP_ATLAS));
    expect(second.animations.map((animation) => animation.frameNames)).toEqual(
      first.animations.map((animation) => animation.frameNames),
    );
  });

  it('writes a rotated frame in packed dimensions so its logical size survives', () => {
    const first = parseLibgdxAtlasSpritesheet(ROUND_TRIP_ATLAS);
    const formatted = formatLibgdxAtlas(first);
    expect(formatted).toContain('idle_1\n  rotate: true\n  xy: 40, 6\n  size: 18, 42');

    const rotated = parseLibgdxAtlasSpritesheet(formatted).frames[1];
    expect(rotated.width).toBe(42);
    expect(rotated.height).toBe(18);
  });
});
