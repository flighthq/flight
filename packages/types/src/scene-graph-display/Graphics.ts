export interface BeginFillCommand {
  type: 'beginFill';
  alpha: number;
  color: number;
}

export interface CubicCurveToCommand {
  type: 'cubicCurveTo';
  anchorX: number;
  anchorY: number;
  controlX1: number;
  controlY1: number;
  controlX2: number;
  controlY2: number;
}

export interface CurveToCommand {
  type: 'curveTo';
  anchorX: number;
  anchorY: number;
  controlX: number;
  controlY: number;
}

export interface DrawCircleCommand {
  type: 'drawCircle';
  radius: number;
  x: number;
  y: number;
}

export interface DrawEllipseCommand {
  type: 'drawEllipse';
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface DrawRectCommand {
  type: 'drawRect';
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface DrawRoundRectCommand {
  type: 'drawRoundRect';
  ellipseHeight: number;
  ellipseWidth: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface EndFillCommand {
  type: 'endFill';
}

export interface LineStyleCommand {
  type: 'lineStyle';
  alpha: number;
  color: number;
  thickness: number;
}

export interface LineToCommand {
  type: 'lineTo';
  x: number;
  y: number;
}

export interface MoveToCommand {
  type: 'moveTo';
  x: number;
  y: number;
}

export type ShapeCommand =
  | BeginFillCommand
  | CubicCurveToCommand
  | CurveToCommand
  | DrawCircleCommand
  | DrawEllipseCommand
  | DrawRectCommand
  | DrawRoundRectCommand
  | EndFillCommand
  | LineStyleCommand
  | LineToCommand
  | MoveToCommand;

export interface Graphics {
  commands: ShapeCommand[];
}
