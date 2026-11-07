// Spritesheet-owned contracts. This header-only lane depends directly on the entity, signals, and
// textureatlas owners.

import type { Entity } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { TextureAtlas } from '@flighthq/textureatlas/contract';

export type SpritesheetAnimationDirection = 'forward' | 'pingpong' | 'pingpong_reverse' | 'reverse';

export interface SpritesheetAnimation extends Entity {
  direction: SpritesheetAnimationDirection;
  frameDuration: number;
  frameDurations: number[] | null;
  frames: number[];
  originX: number;
  originY: number;
  /** Additional repetitions after the first playthrough. `-1` repeats indefinitely. */
  repeatCount: number;
}

export interface SpritesheetFrame extends Entity {
  id: number;
  offsetX: number;
  offsetY: number;
  // Normalized pivot in the original, untrimmed frame (0..1). Null means no authored pivot.
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
}

export interface Spritesheet extends Entity {
  animations: Record<string, SpritesheetAnimation>;
  atlas: TextureAtlas | null;
  frames: SpritesheetFrame[];
}

export interface SpritesheetAnimationData extends Entity {
  direction: SpritesheetAnimationDirection;
  frameDuration: number;
  frameDurations: number[] | null;
  frameNames: string[];
  name: string;
  originX: number;
  originY: number;
  /** Additional repetitions after the first playthrough. `-1` repeats indefinitely. */
  repeatCount: number;
}

export interface SpritesheetFrameData extends Entity {
  height: number;
  name: string;
  offsetX: number;
  offsetY: number;
  // Normalized pivot in the original, untrimmed frame (0..1). Null means no authored pivot.
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}

export interface SpritesheetData extends Entity {
  animations: SpritesheetAnimationData[];
  frames: SpritesheetFrameData[];
  imageFile: string;
  imageHeight: number;
  imageWidth: number;
  scale: number;
}

export interface SpritesheetPlayer extends Entity {
  animation: SpritesheetAnimation | null;
  complete: boolean;
  elapsed: number;
  frameIndex: number;
  onComplete: Signal<void>;
  onLoop: Signal<void>;
  paused: boolean;
  queue: SpritesheetAnimation[];
  speed: number;
}

/** Severity of a spritesheet validation diagnostic. */
export type SpritesheetValidationSeverity = 'error' | 'warning';

/** A single issue reported by `validateSpritesheet` or `validateSpritesheetData`. */
export interface SpritesheetValidationDiagnostic {
  /** Name of the animation this diagnostic is scoped to, or `null` for sheet-level issues. */
  animationName: string | null;
  /** Zero-based index of the frame this diagnostic is scoped to, or `null` for animation-level issues. */
  frameIndex: number | null;
  /** Human-readable description of the issue. */
  message: string;
  /** Whether the issue is fatal (data cannot be used safely) or a warning (data is usable with caveats). */
  severity: SpritesheetValidationSeverity;
}
