import { parseStarlingSpritesheet } from './starlingParse';
import { serializeStarlingSpritesheet } from './starlingSerialize';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="atlas.png">
  <SubTexture name="hero" x="0" y="0" width="64" height="64"/>
  <SubTexture name="coin" x="64" y="0" width="32" height="32"/>
</TextureAtlas>`;

describe('serializeStarlingSpritesheet', () => {
  it('produces a TextureAtlas XML string', () => {
    const data = parseStarlingSpritesheet(XML);
    const serialized = serializeStarlingSpritesheet(data);
    expect(serialized).toContain('<TextureAtlas');
    expect(serialized).toContain('imagePath="atlas.png"');
  });

  it('preserves frame count on round-trip', () => {
    const data = parseStarlingSpritesheet(XML);
    const serialized = serializeStarlingSpritesheet(data);
    const reparsed = parseStarlingSpritesheet(serialized);
    expect(reparsed.frames).toHaveLength(data.frames.length);
  });

  it('round-trips frame names', () => {
    const data = parseStarlingSpritesheet(XML);
    const serialized = serializeStarlingSpritesheet(data);
    const reparsed = parseStarlingSpritesheet(serialized);
    expect(reparsed.frames.map((f) => f.name)).toEqual(data.frames.map((f) => f.name));
  });
});
