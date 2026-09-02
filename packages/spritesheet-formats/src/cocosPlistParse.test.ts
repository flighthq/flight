import type { ImportDiagnostic } from '@flighthq/types/contract';

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

  it('emits no diagnostics on well-formed plist', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseCocosPlistSpritesheet(MINIMAL_PLIST, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it('emits Drop diagnostic for unrecognized frame entries', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>bad.png</key>
    <dict>
      <key>unknownKey</key>
      <string>value</string>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>format</key>
    <integer>3</integer>
    <key>size</key>
    <string>{64,64}</string>
    <key>textureFileName</key>
    <string>atlas.png</string>
  </dict>
</dict>
</plist>`;
    const diagnostics: ImportDiagnostic[] = [];
    const data = parseCocosPlistSpritesheet(plist, diagnostics);
    expect(data.frames).toHaveLength(0);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('spritesheet.cocos-plist.unrecognized-frame');
    expect(diagnostics[0].severity).toBe('Drop');
    expect(diagnostics[0].detail).toMatchObject({ frame: 'bad.png' });
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
