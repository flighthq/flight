import { cloneMatrix, createMatrix } from '@flighthq/geometry/contract';
import type {
  CapsStyle,
  GradientType,
  InterpolationMethod,
  JointStyle,
  LineScaleMode,
  Matrix,
  MorphShape,
  MorphShapeColorEndpoint,
  MorphShapeData,
  MorphShapeGradientEndpoint,
  MorphShapeGradientPaintBinding,
  MorphShapeLineEndpoint,
  MorphShapePaintBinding,
  SpreadMethod,
  Texture,
} from '@flighthq/types/contract';

import { getMorphShapeGradientEndpointIssue } from './explainMorphShapeGradientEndpoints';
import {
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeBeginTextureFill,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTextureStyle,
} from './shapeCommands';

// Appends an ordinary beginFill command backed by a stable start/end paint binding. Geometry and paint
// share MorphShape.progress and are sampled atomically by setMorphShapeProgress.
export function appendMorphShapeBeginFill(
  shape: MorphShape,
  start: Readonly<MorphShapeColorEndpoint>,
  end: Readonly<MorphShapeColorEndpoint>,
): void {
  const commandIndex = shape.data.commands.length;
  appendShapeBeginFill(shape, start.color, start.alpha ?? 1);
  shape.data.paintBindings.push({
    commandIndex,
    endAlpha: end.alpha ?? 1,
    endColor: end.color,
    kind: 'color',
    startAlpha: start.alpha ?? 1,
    startColor: start.color,
  });
  sampleMorphShapePaintBinding(
    shape.data,
    shape.data.paintBindings[shape.data.paintBindings.length - 1],
    shape.data.progress,
  );
}

// Returns false without appending when either gradient endpoint is malformed or their stop counts differ.
// Equal stop counts make sampling allocation-free and match the structural contract of authored morphs.
export function appendMorphShapeBeginGradientFill(
  shape: MorphShape,
  gradientType: GradientType,
  start: Readonly<MorphShapeGradientEndpoint>,
  end: Readonly<MorphShapeGradientEndpoint>,
  spreadMethod: SpreadMethod = 'pad',
  interpolationMethod: InterpolationMethod = 'rgb',
): boolean {
  return appendMorphShapeGradientPaint(
    shape,
    'beginGradientFill',
    gradientType,
    start,
    end,
    spreadMethod,
    interpolationMethod,
  );
}

// A texture itself is structurally shared by both endpoints; only its placement matrix morphs. Null is
// the identity matrix, so a null/non-null pair interpolates continuously without changing command shape.
export function appendMorphShapeBeginTextureFill(
  shape: MorphShape,
  texture: Texture,
  startMatrix: Readonly<Matrix> | null = null,
  endMatrix: Readonly<Matrix> | null = startMatrix,
): void {
  appendMorphShapeTexturePaint(shape, 'beginTextureFill', texture, startMatrix, endMatrix);
}

export function appendMorphShapeLineGradientStyle(
  shape: MorphShape,
  gradientType: GradientType,
  start: Readonly<MorphShapeGradientEndpoint>,
  end: Readonly<MorphShapeGradientEndpoint>,
  spreadMethod: SpreadMethod = 'pad',
  interpolationMethod: InterpolationMethod = 'rgb',
): boolean {
  return appendMorphShapeGradientPaint(
    shape,
    'lineGradientStyle',
    gradientType,
    start,
    end,
    spreadMethod,
    interpolationMethod,
  );
}

export function appendMorphShapeLineStyle(
  shape: MorphShape,
  start: Readonly<MorphShapeLineEndpoint>,
  end: Readonly<MorphShapeLineEndpoint>,
  pixelHinting = false,
  scaleMode: LineScaleMode = 'normal',
  caps: CapsStyle = 'none',
  joints: JointStyle = 'round',
  miterLimit = 3,
): void {
  const commandIndex = shape.data.commands.length;
  appendShapeLineStyle(
    shape,
    start.thickness,
    start.color,
    start.alpha ?? 1,
    pixelHinting,
    scaleMode,
    caps,
    joints,
    miterLimit,
  );
  shape.data.paintBindings.push({
    commandIndex,
    endAlpha: end.alpha ?? 1,
    endColor: end.color,
    endThickness: end.thickness,
    kind: 'line',
    startAlpha: start.alpha ?? 1,
    startColor: start.color,
    startThickness: start.thickness,
  });
  sampleMorphShapePaintBinding(
    shape.data,
    shape.data.paintBindings[shape.data.paintBindings.length - 1],
    shape.data.progress,
  );
}

export function appendMorphShapeLineTextureStyle(
  shape: MorphShape,
  texture: Texture,
  startMatrix: Readonly<Matrix> | null = null,
  endMatrix: Readonly<Matrix> | null = startMatrix,
): void {
  appendMorphShapeTexturePaint(shape, 'lineTextureStyle', texture, startMatrix, endMatrix);
}

export function sampleMorphShapePaintBindings(data: MorphShapeData, progress: number): void {
  for (let i = 0; i < data.paintBindings.length; i++) {
    sampleMorphShapePaintBinding(data, data.paintBindings[i], progress);
  }
}

function appendMorphShapeGradientPaint(
  shape: MorphShape,
  commandKey: 'beginGradientFill' | 'lineGradientStyle',
  gradientType: GradientType,
  start: Readonly<MorphShapeGradientEndpoint>,
  end: Readonly<MorphShapeGradientEndpoint>,
  spreadMethod: SpreadMethod,
  interpolationMethod: InterpolationMethod,
): boolean {
  if (getMorphShapeGradientEndpointIssue(start, end) !== 0) return false;
  const commandIndex = shape.data.commands.length;
  const startSource = start.matrix ?? null;
  const endSource = end.matrix ?? null;
  const hasMatrix = startSource !== null || endSource !== null;
  const startMatrix = hasMatrix ? cloneMatrix(startSource ?? identityMatrix) : null;
  const endMatrix = hasMatrix ? cloneMatrix(endSource ?? identityMatrix) : null;
  const currentMatrix = createSampledMatrix(startMatrix, endMatrix);
  const colors = [...start.colors];
  const alphas = [...start.alphas];
  const ratios = [...start.ratios];
  if (commandKey === 'beginGradientFill') {
    appendShapeBeginGradientFill(
      shape,
      gradientType,
      colors,
      alphas,
      ratios,
      currentMatrix,
      spreadMethod,
      interpolationMethod,
      start.focalPointRatio ?? 0,
    );
  } else {
    appendShapeLineGradientStyle(
      shape,
      gradientType,
      colors,
      alphas,
      ratios,
      currentMatrix,
      spreadMethod,
      interpolationMethod,
      start.focalPointRatio ?? 0,
    );
  }
  const binding: MorphShapeGradientPaintBinding = {
    commandIndex,
    commandKey,
    endAlphas: [...end.alphas],
    endColors: [...end.colors],
    endFocalPointRatio: end.focalPointRatio ?? 0,
    endMatrix,
    endRatios: [...end.ratios],
    kind: 'gradient',
    startAlphas: [...start.alphas],
    startColors: [...start.colors],
    startFocalPointRatio: start.focalPointRatio ?? 0,
    startMatrix,
    startRatios: [...start.ratios],
  };
  shape.data.paintBindings.push(binding);
  sampleMorphShapePaintBinding(shape.data, binding, shape.data.progress);
  return true;
}

function appendMorphShapeTexturePaint(
  shape: MorphShape,
  commandKey: 'beginTextureFill' | 'lineTextureStyle',
  texture: Texture,
  startSource: Readonly<Matrix> | null,
  endSource: Readonly<Matrix> | null,
): void {
  if (startSource === null && endSource === null) {
    if (commandKey === 'beginTextureFill') appendShapeBeginTextureFill(shape, texture);
    else appendShapeLineTextureStyle(shape, texture);
    return;
  }
  const commandIndex = shape.data.commands.length;
  const startMatrix = cloneMatrix(startSource ?? identityMatrix);
  const endMatrix = cloneMatrix(endSource ?? identityMatrix);
  const currentMatrix = createSampledMatrix(startMatrix, endMatrix)!;
  if (commandKey === 'beginTextureFill') appendShapeBeginTextureFill(shape, texture, currentMatrix);
  else appendShapeLineTextureStyle(shape, texture, currentMatrix);
  const binding: MorphShapePaintBinding = { commandIndex, commandKey, endMatrix, kind: 'texture', startMatrix };
  shape.data.paintBindings.push(binding);
  sampleMorphShapePaintBinding(shape.data, binding, shape.data.progress);
}

function sampleMorphShapePaintBinding(
  data: Readonly<MorphShapeData>,
  binding: MorphShapePaintBinding,
  progress: number,
): void {
  const commands = data.commands;
  const i = binding.commandIndex;
  if (binding.kind === 'color') {
    if (commands[i] !== 'beginFill') return;
    commands[i + 2] = interpolateRgba(binding.startColor, binding.endColor, progress);
    commands[i + 3] = interpolateNumber(binding.startAlpha, binding.endAlpha, progress);
    return;
  }
  if (binding.kind === 'line') {
    if (commands[i] !== 'lineStyle') return;
    commands[i + 2] = interpolateNumber(binding.startThickness, binding.endThickness, progress);
    commands[i + 3] = interpolateRgba(binding.startColor, binding.endColor, progress);
    commands[i + 4] = interpolateNumber(binding.startAlpha, binding.endAlpha, progress);
    return;
  }
  if (commands[i] !== binding.commandKey) return;
  if (binding.kind === 'texture') {
    sampleMatrix(commands[i + 3] as Matrix, binding.startMatrix, binding.endMatrix, progress);
    return;
  }
  const colors = commands[i + 3] as number[];
  const alphas = commands[i + 4] as number[];
  const ratios = commands[i + 5] as number[];
  for (let n = 0; n < binding.startColors.length; n++) {
    colors[n] = interpolateRgba(binding.startColors[n], binding.endColors[n], progress);
    alphas[n] = interpolateNumber(binding.startAlphas[n], binding.endAlphas[n], progress);
    ratios[n] = interpolateNumber(binding.startRatios[n], binding.endRatios[n], progress);
  }
  const matrix = commands[i + 6] as Matrix | null;
  if (matrix !== null && binding.startMatrix !== null && binding.endMatrix !== null) {
    sampleMatrix(matrix, binding.startMatrix, binding.endMatrix, progress);
  }
  commands[i + 9] = interpolateNumber(binding.startFocalPointRatio, binding.endFocalPointRatio, progress);
}

function createSampledMatrix(start: Readonly<Matrix> | null, end: Readonly<Matrix> | null): Matrix | null {
  if (start === null && end === null) return null;
  return cloneMatrix(start ?? identityMatrix);
}

function sampleMatrix(out: Matrix, start: Readonly<Matrix>, end: Readonly<Matrix>, progress: number): void {
  out.a = interpolateNumber(start.a, end.a, progress);
  out.b = interpolateNumber(start.b, end.b, progress);
  out.c = interpolateNumber(start.c, end.c, progress);
  out.d = interpolateNumber(start.d, end.d, progress);
  out.tx = interpolateNumber(start.tx, end.tx, progress);
  out.ty = interpolateNumber(start.ty, end.ty, progress);
}

function interpolateNumber(start: number, end: number, progress: number): number {
  if (progress === 0) return start;
  if (progress === 1) return end;
  return start + (end - start) * progress;
}

function interpolateRgba(start: number, end: number, progress: number): number {
  const r = interpolateByte((start >>> 24) & 0xff, (end >>> 24) & 0xff, progress);
  const g = interpolateByte((start >>> 16) & 0xff, (end >>> 16) & 0xff, progress);
  const b = interpolateByte((start >>> 8) & 0xff, (end >>> 8) & 0xff, progress);
  const a = interpolateByte(start & 0xff, end & 0xff, progress);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

function interpolateByte(start: number, end: number, progress: number): number {
  return Math.max(0, Math.min(0xff, Math.round(interpolateNumber(start, end, progress))));
}

const identityMatrix = createMatrix();
