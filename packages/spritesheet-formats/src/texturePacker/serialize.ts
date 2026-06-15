import type { SpritesheetData } from '@flighthq/spritesheet';

import type {
  TexturePackerArrayDocument,
  TexturePackerArrayFrame,
  TexturePackerDocument,
  TexturePackerHashDocument,
  TexturePackerHashFrame,
  TexturePackerMeta,
} from './schema';

export interface TexturePackerSerializeOptions {
  /** Override the output format variant. Defaults to the variant of `existing`, or `'hash'`. */
  variant?: 'array' | 'hash';
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function dataToMeta(data: Readonly<SpritesheetData>, existing: Partial<TexturePackerMeta>): TexturePackerMeta {
  return {
    app: existing.app ?? 'https://www.codeandweb.com/texturepacker',
    format: existing.format ?? 'RGBA8888',
    frameTags: data.animations.length
      ? data.animations.map((anim) => {
          const firstIdx = data.frames.findIndex((f) => f.name === anim.frameNames[0]);
          const lastIdx = data.frames.findIndex((f) => f.name === anim.frameNames[anim.frameNames.length - 1]);
          return {
            direction: anim.direction,
            from: firstIdx >= 0 ? firstIdx : 0,
            name: anim.name,
            to: lastIdx >= 0 ? lastIdx : 0,
          };
        })
      : undefined,
    image: data.imageFile || existing.image || '',
    scale: data.scale !== 1 ? data.scale : (existing.scale ?? 1),
    size: { h: data.imageHeight, w: data.imageWidth },
    version: existing.version ?? '1.0',
  };
}

function frameToEntry(frame: Readonly<SpritesheetData['frames'][0]>): TexturePackerHashFrame {
  const trimmed =
    frame.offsetX !== 0 ||
    frame.offsetY !== 0 ||
    frame.sourceWidth !== frame.width ||
    frame.sourceHeight !== frame.height;
  return {
    frame: { h: frame.height, w: frame.width, x: frame.x, y: frame.y },
    ...(frame.pivotX !== null && frame.pivotY !== null ? { pivot: { x: frame.pivotX, y: frame.pivotY } } : {}),
    rotated: frame.rotated,
    sourceSize: { h: frame.sourceHeight, w: frame.sourceWidth },
    spriteSourceSize: {
      h: frame.height,
      w: frame.width,
      x: frame.offsetX,
      y: frame.offsetY,
    },
    trimmed,
  };
}

function dataToHashDocument(
  data: Readonly<SpritesheetData>,
  existing: Partial<TexturePackerHashDocument>,
): TexturePackerHashDocument {
  const frames: Record<string, TexturePackerHashFrame> = {};
  for (const frame of data.frames) {
    frames[frame.name] = frameToEntry(frame);
  }
  return { frames, meta: dataToMeta(data, existing.meta ?? {}) };
}

function dataToArrayDocument(
  data: Readonly<SpritesheetData>,
  existing: Partial<TexturePackerArrayDocument>,
): TexturePackerArrayDocument {
  const frames: TexturePackerArrayFrame[] = data.frames.map((frame) => ({
    filename: frame.name,
    ...frameToEntry(frame),
  }));
  return { frames, meta: dataToMeta(data, existing.meta ?? {}) };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Serialise a SpritesheetData to a Texture Packer JSON string.
 *
 *  Pass the `document` returned by `parseTexturePackerSpritesheetDocument` to preserve any fields
 *  that don't round-trip through the data (app name, format string, scale).
 *  The output variant (hash vs array) is inferred from the existing document or
 *  overridden via `options.variant`. */
export function serializeTexturePackerSpritesheet(
  data: Readonly<SpritesheetData>,
  existing?: Partial<TexturePackerDocument>,
  options?: TexturePackerSerializeOptions,
): string {
  const existingIsArray = existing !== undefined && Array.isArray((existing as TexturePackerArrayDocument).frames);
  const variant = options?.variant ?? (existingIsArray ? 'array' : 'hash');

  if (variant === 'array') {
    const doc = dataToArrayDocument(data, (existing as Partial<TexturePackerArrayDocument>) ?? {});
    return JSON.stringify(doc, null, 2);
  }

  const doc = dataToHashDocument(data, (existing as Partial<TexturePackerHashDocument>) ?? {});
  return JSON.stringify(doc, null, 2);
}
