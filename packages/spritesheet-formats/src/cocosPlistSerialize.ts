import type { SpritesheetData, SpritesheetFrameData } from '@flighthq/spritesheet';

import type { CocosPlistDocument, CocosPlistFrame } from './cocosPlistSchema';

/** Serialise a SpritesheetData to a Cocos Creator / Cocos2d-x plist XML atlas string.
 *
 *  Pass the `document` returned by `parseCocosPlistSpritesheetDocument` to preserve any
 *  fields that don't round-trip through the data (format version, metadata). */
export function serializeCocosPlistSpritesheet(
  data: Readonly<SpritesheetData>,
  existing?: Partial<CocosPlistDocument>,
): string {
  const frames: Record<string, CocosPlistFrame> = {};
  for (const frame of data.frames) {
    frames[frame.name] = frameToEntry(frame);
  }
  const doc: CocosPlistDocument = {
    frames,
    metadata: {
      format: existing?.metadata?.format ?? 3,
      size: `{${data.imageWidth},${data.imageHeight}}`,
      textureFileName: data.imageFile || existing?.metadata?.textureFileName || '',
    },
  };
  return documentToXml(doc);
}

function documentToXml(doc: Readonly<CocosPlistDocument>): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '\t<key>frames</key>',
    '\t<dict>',
  ];
  for (const [name, frame] of Object.entries(doc.frames)) {
    lines.push(`\t\t<key>${escapeXml(name)}</key>`);
    lines.push('\t\t<dict>');
    lines.push(`\t\t\t<key>frame</key>`);
    lines.push(`\t\t\t<string>${escapeXml(frame.frame)}</string>`);
    lines.push(`\t\t\t<key>spriteOffset</key>`);
    lines.push(`\t\t\t<string>${escapeXml(frame.spriteOffset)}</string>`);
    lines.push(`\t\t\t<key>spriteSize</key>`);
    lines.push(`\t\t\t<string>${escapeXml(frame.spriteSize)}</string>`);
    lines.push(`\t\t\t<key>spriteSourceSize</key>`);
    lines.push(`\t\t\t<string>${escapeXml(frame.spriteSourceSize)}</string>`);
    lines.push(`\t\t\t<key>spriteTrimmed</key>`);
    lines.push(`\t\t\t${plistValue(frame.spriteTrimmed)}`);
    lines.push(`\t\t\t<key>textureRotated</key>`);
    lines.push(`\t\t\t${plistValue(frame.textureRotated)}`);
    lines.push('\t\t</dict>');
  }
  lines.push('\t</dict>');
  lines.push('\t<key>metadata</key>');
  lines.push('\t<dict>');
  lines.push('\t\t<key>format</key>');
  lines.push(`\t\t<integer>${doc.metadata.format}</integer>`);
  lines.push('\t\t<key>size</key>');
  lines.push(`\t\t<string>${escapeXml(doc.metadata.size)}</string>`);
  lines.push('\t\t<key>textureFileName</key>');
  lines.push(`\t\t<string>${escapeXml(doc.metadata.textureFileName)}</string>`);
  lines.push('\t</dict>');
  lines.push('</dict>');
  lines.push('</plist>');
  return lines.join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function frameToEntry(frame: Readonly<SpritesheetFrameData>): CocosPlistFrame {
  const rectStr = `{{${frame.x},${frame.y}},{${frame.width},${frame.height}}}`;
  const offsetStr = `{${frame.offsetX},${frame.offsetY}}`;
  const sourceSizeStr = `{${frame.sourceWidth},${frame.sourceHeight}}`;
  const sizeStr = `{${frame.width},${frame.height}}`;
  const trimmed =
    frame.offsetX !== 0 ||
    frame.offsetY !== 0 ||
    frame.sourceWidth !== frame.width ||
    frame.sourceHeight !== frame.height;
  return {
    frame: rectStr,
    spriteOffset: offsetStr,
    spriteSize: sizeStr,
    spriteSourceSize: sourceSizeStr,
    spriteTrimmed: trimmed,
    textureRotated: frame.rotated,
  };
}

function plistValue(el: boolean): string {
  if (typeof el === 'boolean') return el ? '<true/>' : '<false/>';
  return `<string>${escapeXml(String(el))}</string>`;
}
