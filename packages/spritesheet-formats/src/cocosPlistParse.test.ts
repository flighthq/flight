import { parseCocosPlistSpritesheet, parseCocosPlistSpritesheetDocument } from './cocosPlistParse';

const MINIMAL_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
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
    <key>coin.png</key>
    <dict>
      <key>frame</key>
      <string>{{64,0},{32,32}}</string>
      <key>spriteOffset</key>
      <string>{0,0}</string>
      <key>spriteSize</key>
      <string>{32,32}</string>
      <key>spriteSourceSize</key>
      <string>{32,32}</string>
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
    <string>{256,128}</string>
    <key>textureFileName</key>
    <string>atlas.png</string>
  </dict>
</dict>
</plist>`;

const ROTATED_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>rotated.png</key>
    <dict>
      <key>frame</key>
      <string>{{0,0},{32,64}}</string>
      <key>spriteOffset</key>
      <string>{0,0}</string>
      <key>spriteSize</key>
      <string>{64,32}</string>
      <key>spriteSourceSize</key>
      <string>{64,32}</string>
      <key>spriteTrimmed</key>
      <false/>
      <key>textureRotated</key>
      <true/>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>format</key>
    <integer>3</integer>
    <key>size</key>
    <string>{128,128}</string>
    <key>textureFileName</key>
    <string>rotated.png</string>
  </dict>
</dict>
</plist>`;

describe('parseCocosPlistSpritesheet', () => {
  it('parses frame names', () => {
    const data = parseCocosPlistSpritesheet(MINIMAL_PLIST);
    const names = data.frames.map((f) => f.name).sort();
    expect(names).toContain('hero.png');
    expect(names).toContain('coin.png');
  });

  it('parses frame positions', () => {
    const data = parseCocosPlistSpritesheet(MINIMAL_PLIST);
    const hero = data.frames.find((f) => f.name === 'hero.png');
    expect(hero?.x).toBe(0);
    expect(hero?.y).toBe(0);
    expect(hero?.width).toBe(64);
    expect(hero?.height).toBe(64);
  });

  it('parses atlas image file and dimensions', () => {
    const data = parseCocosPlistSpritesheet(MINIMAL_PLIST);
    expect(data.imageFile).toBe('atlas.png');
    expect(data.imageWidth).toBe(256);
    expect(data.imageHeight).toBe(128);
  });

  it('handles rotated frames with swapped dimensions', () => {
    const data = parseCocosPlistSpritesheet(ROTATED_PLIST);
    const frame = data.frames.find((f) => f.name === 'rotated.png');
    expect(frame?.rotated).toBe(true);
    // Rotated: atlas rect is 32x64, so in logical orientation it is 64x32
    expect(frame?.width).toBe(64);
    expect(frame?.height).toBe(32);
  });

  it('produces empty animations array', () => {
    const data = parseCocosPlistSpritesheet(MINIMAL_PLIST);
    expect(data.animations).toHaveLength(0);
  });
});

describe('parseCocosPlistSpritesheetDocument', () => {
  it('returns both data and document', () => {
    const result = parseCocosPlistSpritesheetDocument(MINIMAL_PLIST);
    expect(result.data.frames.length).toBeGreaterThan(0);
    expect(result.document.metadata.textureFileName).toBe('atlas.png');
    expect(result.document.metadata.format).toBe(3);
  });
});
