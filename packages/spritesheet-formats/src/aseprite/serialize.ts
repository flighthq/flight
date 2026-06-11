import type { SpritesheetData } from '@flighthq/spritesheet';

import type {
  AsepriteArrayDocument,
  AsepriteArrayFrame,
  AsepriteBaseFrame,
  AsepriteDocument,
  AsepriteHashDocument,
  AsepriteMeta,
} from './schema';

export interface AsepriteSerializeOptions {
  /** Override the output format variant. Defaults to the variant of `existing`, or `'hash'`. */
  variant?: 'array' | 'hash';
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function dataToMeta(data: Readonly<SpritesheetData>, existing: Partial<AsepriteMeta>): AsepriteMeta {
  const tags = data.animations.map((anim, i) => {
    const firstIdx = data.frames.findIndex((f) => f.name === anim.frameNames[0]);
    const lastIdx = data.frames.findIndex((f) => f.name === anim.frameNames[anim.frameNames.length - 1]);
    return {
      direction: anim.direction,
      from: firstIdx >= 0 ? firstIdx : 0,
      name: anim.name,
      to: lastIdx >= 0 ? lastIdx : 0,
      ...(existing.frameTags?.[i]?.color !== undefined ? { color: existing.frameTags[i].color } : {}),
    };
  });

  return {
    app: existing.app ?? 'https://www.aseprite.org/',
    format: existing.format ?? 'RGBA8888',
    frameTags: tags,
    image: data.imageFile || existing.image || '',
    ...(existing.layers !== undefined ? { layers: existing.layers } : {}),
    scale: data.scale !== 1 ? String(data.scale) : (existing.scale ?? '1'),
    size: { h: data.imageHeight, w: data.imageWidth },
    version: existing.version ?? '1.3',
  };
}

function frameToEntry(frame: Readonly<SpritesheetData['frames'][0]>, durationMs: number): AsepriteBaseFrame {
  const trimmed =
    frame.offsetX !== 0 ||
    frame.offsetY !== 0 ||
    frame.sourceWidth !== frame.width ||
    frame.sourceHeight !== frame.height;
  return {
    duration: durationMs,
    frame: { h: frame.height, w: frame.width, x: frame.x, y: frame.y },
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

function resolveFrameDuration(data: Readonly<SpritesheetData>, frameName: string): number {
  for (const anim of data.animations) {
    const idx = anim.frameNames.indexOf(frameName);
    if (idx === -1) continue;
    if (anim.frameDurations !== null) return anim.frameDurations[idx] ?? anim.frameDuration;
    return anim.frameDuration;
  }
  return 100;
}

function dataToHashDocument(
  data: Readonly<SpritesheetData>,
  existing: Partial<AsepriteHashDocument>,
): AsepriteHashDocument {
  const frames: Record<string, AsepriteBaseFrame> = {};
  for (const frame of data.frames) {
    frames[frame.name] = frameToEntry(frame, resolveFrameDuration(data, frame.name));
  }
  return { frames, meta: dataToMeta(data, existing.meta ?? {}) };
}

function dataToArrayDocument(
  data: Readonly<SpritesheetData>,
  existing: Partial<AsepriteArrayDocument>,
): AsepriteArrayDocument {
  const frames: AsepriteArrayFrame[] = data.frames.map((frame) => ({
    filename: frame.name,
    ...frameToEntry(frame, resolveFrameDuration(data, frame.name)),
  }));
  return { frames, meta: dataToMeta(data, existing.meta ?? {}) };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Serialise a SpritesheetData to an Aseprite JSON string.
 *
 *  Pass the `document` returned by `loadAseprite` to preserve any fields that
 *  don't round-trip through the data (app name, layer list, tag colours).
 *  Per-frame durations in `animation.frameDurations` are written back to each
 *  frame's `duration` field so they survive a reload. */
export function serializeAseprite(
  data: Readonly<SpritesheetData>,
  existing?: Partial<AsepriteDocument>,
  options?: AsepriteSerializeOptions,
): string {
  const existingIsArray = existing !== undefined && Array.isArray((existing as AsepriteArrayDocument).frames);
  const variant = options?.variant ?? (existingIsArray ? 'array' : 'hash');

  if (variant === 'array') {
    const doc = dataToArrayDocument(data, (existing as Partial<AsepriteArrayDocument>) ?? {});
    return JSON.stringify(doc, null, 2);
  }

  const doc = dataToHashDocument(data, (existing as Partial<AsepriteHashDocument>) ?? {});
  return JSON.stringify(doc, null, 2);
}
