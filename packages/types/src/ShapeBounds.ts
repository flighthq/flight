import type { Shape } from './Shape';
import type { CapsStyle, JointStyle, ShapeCommandKey, ShapeCommandToken } from './ShapeCommand';

export type ShapeBoundsMode = 'fill' | 'ink';

// The command-local view passed to a bounds contribution. It deliberately exposes no absolute
// command-buffer position or neighboring command: sequence knowledge lives in ShapeBoundsContext.
export interface ShapeCommandArgumentCursor {
  readonly length: number;
  getArgument(relativeIndex: number): ShapeCommandToken | undefined;
}

// A contribution writes geometry through this stateful pen. The traversal supplies separate fill
// and stroke contexts, so the same command registry serves continuous fill bounds and ink bounds.
export interface ShapeBoundsContext {
  closePath(): void;
  cubicCurveTo(
    controlX1: number,
    controlY1: number,
    controlX2: number,
    controlY2: number,
    anchorX: number,
    anchorY: number,
  ): void;
  curveTo(controlX: number, controlY: number, anchorX: number, anchorY: number): void;
  drawCircle(x: number, y: number, radius: number): void;
  drawEllipse(x: number, y: number, width: number, height: number): void;
  drawRectangle(x: number, y: number, width: number, height: number): void;
  expandPoint(x: number, y: number): void;
  flushPath(): void;
  lineTo(x: number, y: number): void;
  moveTo(x: number, y: number): void;
  setStrokeStyle(width: number, caps: CapsStyle, joints: JointStyle, miterLimit: number): void;
}

export type ShapeBoundsCommandHandler = (
  context: ShapeBoundsContext,
  argumentsCursor: Readonly<ShapeCommandArgumentCursor>,
) => void;

// Both fields are mandatory. `null` means the command intentionally contributes no geometry in that
// mode; an absent registry key means nobody registered the command and makes the traversal incomplete.
export interface ShapeBoundsCommand<K extends ShapeCommandKey = ShapeCommandKey> {
  readonly key: K;
  readonly fillBounds: ShapeBoundsCommandHandler | null;
  readonly strokeBounds: ShapeBoundsCommandHandler | null;
}

export interface ShapeBoundsExplanation {
  readonly complete: boolean;
  readonly missingCommandKeys: readonly string[];
  readonly mode: ShapeBoundsMode;
}

export type ShapeBoundsGuard = (source: Readonly<Shape>, mode: ShapeBoundsMode, missingCommandKey: string) => void;
