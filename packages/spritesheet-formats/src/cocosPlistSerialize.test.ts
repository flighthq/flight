import { parseCocosPlistSpritesheet } from './cocosPlistParse';
import { serializeCocosPlistSpritesheet } from './cocosPlistSerialize';

const MINIMAL_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>hero.png</key>
    <dict>
      <key>frame</key>
      <string>{{0,0},{64,64}}</string>
      <key>spriteOffset</key>
      <string>{0,0}</string>
      <key>spriteSize</key>
      <string>{64,64}</string>
      <key>spriteSourceSize</key>
      <string>{64,64}</string>
      <key>spriteTrimmed</key>
      <false/>
      <key>textureRotated</key>
      <false/>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>format</key>
    <integer>3</integer>
    <key>size</key>
    <string>{128,64}</string>
    <key>textureFileName</key>
    <string>atlas.png</string>
  </dict>
</dict>
</plist>`;

describe('serializeCocosPlistSpritesheet', () => {
  it('produces XML with a plist root element', () => {
    const data = parseCocosPlistSpritesheet(MINIMAL_PLIST);
    const serialized = serializeCocosPlistSpritesheet(data);
    expect(serialized).toContain('<plist');
    expect(serialized).toContain('</plist>');
  });
  it('preserves frame count on round-trip', () => {
    const data = parseCocosPlistSpritesheet(MINIMAL_PLIST);
    const serialized = serializeCocosPlistSpritesheet(data);
    const reparsed = parseCocosPlistSpritesheet(serialized);
    expect(reparsed.frames).toHaveLength(data.frames.length);
  });
  it('preserves image file on round-trip', () => {
    const data = parseCocosPlistSpritesheet(MINIMAL_PLIST);
    const serialized = serializeCocosPlistSpritesheet(data);
    const reparsed = parseCocosPlistSpritesheet(serialized);
    expect(reparsed.imageFile).toBe(data.imageFile);
  });
});
