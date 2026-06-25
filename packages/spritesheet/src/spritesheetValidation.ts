import type { Spritesheet, SpritesheetValidationDiagnostic } from '@flighthq/types';

import type { SpritesheetData } from './spritesheetData';

// Validates a runtime `Spritesheet` for structural integrity:
// - Frames referencing atlas region IDs that do not exist in the atlas.
// - Animations referencing frame indices outside the sheet's frame array bounds.
// - Animations with zero frames.
// Returns null when the spritesheet is valid, or an array of diagnostics when issues are found.
export function validateSpritesheet(spritesheet: Readonly<Spritesheet>): SpritesheetValidationDiagnostic[] | null {
  const diagnostics: SpritesheetValidationDiagnostic[] = [];
  const { atlas, animations, frames } = spritesheet;
  // Check frame → atlas region resolution.
  if (atlas !== null) {
    const regionIds = new Set(atlas.regions.map((r) => r.id));
    for (let fi = 0; fi < frames.length; fi++) {
      if (!regionIds.has(frames[fi].id)) {
        diagnostics.push({
          animationName: null,
          frameIndex: fi,
          message: `Frame ${fi} references atlas region id ${frames[fi].id} which does not exist in the atlas.`,
          severity: 'error',
        });
      }
    }
  }
  // Check animation → frame index resolution.
  for (const [animName, anim] of Object.entries(animations)) {
    if (anim.frames.length === 0) {
      diagnostics.push({
        animationName: animName,
        frameIndex: null,
        message: `Animation "${animName}" has no frames.`,
        severity: 'warning',
      });
    }
    for (let ai = 0; ai < anim.frames.length; ai++) {
      const frameRef = anim.frames[ai];
      if (frameRef < 0 || frameRef >= frames.length) {
        diagnostics.push({
          animationName: animName,
          frameIndex: ai,
          message: `Animation "${animName}" references frame index ${frameRef} which is out of range (sheet has ${frames.length} frames).`,
          severity: 'error',
        });
      }
    }
  }
  return diagnostics.length > 0 ? diagnostics : null;
}

// Validates a `SpritesheetData` descriptor for structural integrity:
// - Frames with empty names (warning — not an error, positional fallback is used at hydration).
// - Animations referencing frame names not found in the frame list.
// - Animations with zero frame names (warning — all frames are used as fallback, which may be intentional).
// - Per-frame duration arrays whose length does not match the frame name count.
// Returns null when valid, or an array of diagnostics when issues are found.
export function validateSpritesheetData(data: Readonly<SpritesheetData>): SpritesheetValidationDiagnostic[] | null {
  const diagnostics: SpritesheetValidationDiagnostic[] = [];
  const { animations, frames } = data;
  // Build a set of all frame names for fast lookup (skip empty names).
  const frameNameSet = new Set<string>();
  for (const fd of frames) {
    if (fd.name !== '') {
      frameNameSet.add(fd.name);
    }
  }
  for (const ad of animations) {
    if (ad.frameNames.length === 0) {
      diagnostics.push({
        animationName: ad.name,
        frameIndex: null,
        message: `Animation "${ad.name}" has no frameNames — all sheet frames will be used as the frame list.`,
        severity: 'warning',
      });
    } else {
      for (let ai = 0; ai < ad.frameNames.length; ai++) {
        const fname = ad.frameNames[ai];
        if (!frameNameSet.has(fname)) {
          diagnostics.push({
            animationName: ad.name,
            frameIndex: ai,
            message: `Animation "${ad.name}" references frame name "${fname}" which is not present in the data frame list.`,
            severity: 'error',
          });
        }
      }
      // Check per-frame duration array length matches frame name count.
      if (ad.frameDurations !== null && ad.frameDurations.length !== ad.frameNames.length) {
        diagnostics.push({
          animationName: ad.name,
          frameIndex: null,
          message: `Animation "${ad.name}" has ${ad.frameDurations.length} frameDurations but ${ad.frameNames.length} frameNames — lengths should match.`,
          severity: 'warning',
        });
      }
    }
  }
  return diagnostics.length > 0 ? diagnostics : null;
}
