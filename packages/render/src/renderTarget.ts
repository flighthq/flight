import { createMatrix, inverseMatrix, multiplyMatrix } from '@flighthq/geometry/contract';
import { getNodeLocalMatrix } from '@flighthq/node/contract';
import type {
  MatrixLike,
  Node2D,
  RectangleLike,
  RenderEffectPadding,
  RenderTargetAxes,
  RenderTargetAxisDifference,
  RenderTargetDescriptor,
  ResolvedRenderTargetDescriptor,
} from '@flighthq/types/contract';

/**
 * Writes into outCacheTransform the transform to pass to the cache resolver so the
 * cached image is placed back at the original scene position.
 */
export function computeRenderCacheTransform(
  outCacheTransform: MatrixLike,
  bounds: Readonly<RectangleLike>,
  contentX: number = 0,
  contentY: number = 0,
): void {
  outCacheTransform.a = 1;
  outCacheTransform.b = 0;
  outCacheTransform.c = 0;
  outCacheTransform.d = 1;
  outCacheTransform.tx = bounds.x - contentX;
  outCacheTransform.ty = bounds.y - contentY;
}

export function computeRenderTargetSize(
  out: { width: number; height: number },
  bounds: Readonly<RectangleLike>,
  padding: number | Readonly<RenderEffectPadding> = 0,
  minWidth: number = 1,
  minHeight: number = 1,
): { width: number; height: number } {
  const horizontal = typeof padding === 'number' ? padding * 2 : padding.left + padding.right;
  const vertical = typeof padding === 'number' ? padding * 2 : padding.top + padding.bottom;
  out.width = Math.max(minWidth, Math.ceil(bounds.width) + horizontal);
  out.height = Math.max(minHeight, Math.ceil(bounds.height) + vertical);
  return out;
}

/**
 * Writes into outRenderTransform the transform to set as state.renderTransform2D when
 * capturing source into a render target. Maps source content into target pixel space so
 * that the bounds origin lands at (contentX, contentY).
 */
export function computeScene2DRenderTargetTransform(
  outRenderTransform: MatrixLike,
  source: Node2D,
  bounds: Readonly<RectangleLike>,
  contentX: number = 0,
  contentY: number = 0,
): void {
  const localTransform = getNodeLocalMatrix(source);
  inverseMatrix(_tempInvLocal, localTransform);
  _tempTranslation.a = 1;
  _tempTranslation.b = 0;
  _tempTranslation.c = 0;
  _tempTranslation.d = 1;
  _tempTranslation.tx = contentX - bounds.x;
  _tempTranslation.ty = contentY - bounds.y;
  multiplyMatrix(outRenderTransform, _tempTranslation, _tempInvLocal);
}

// Returns plain-data axis differences in a stable order. Backends retain the requested and effective
// shapes, then use this common comparison so every explain* surface reports substitutions uniformly.
export function explainRenderTargetAxes(
  requested: Readonly<RenderTargetAxes>,
  effective: Readonly<RenderTargetAxes>,
): RenderTargetAxisDifference[] {
  const differences: RenderTargetAxisDifference[] = [];
  for (const axis of _renderTargetAxisOrder) {
    const requestedValue = requested[axis];
    const effectiveValue = effective[axis];
    const equal =
      Array.isArray(requestedValue) && Array.isArray(effectiveValue)
        ? requestedValue.length === effectiveValue.length &&
          requestedValue.every((value, index) => value === effectiveValue[index])
        : requestedValue === effectiveValue;
    if (!equal) differences.push({ axis, effective: effectiveValue, requested: requestedValue });
  }
  return differences;
}

// Resolves every substrate-independent default and normalization once. Backend realizations start
// here and apply only device capability substitutions (for example GL MAX_SAMPLES or float-render
// support), so Canvas/GL/WGPU cannot independently reinterpret the descriptor's optional axes.
export function resolveRenderTargetDescriptor(
  descriptor: Readonly<RenderTargetDescriptor>,
): ResolvedRenderTargetDescriptor {
  const width = Math.max(1, Math.ceil(descriptor.width));
  const height = Math.max(1, Math.ceil(descriptor.height));
  const colorAttachments = Math.max(1, Math.ceil(descriptor.colorAttachments ?? 1));
  const defaultFormat = descriptor.format ?? 'rgba8';
  const colorFormats: ResolvedRenderTargetDescriptor['colorFormats'] = Array.from(
    { length: colorAttachments },
    (_, index) => descriptor.colorFormats?.[index] ?? defaultFormat,
  );

  return {
    width,
    height,
    format: colorFormats[0]!,
    colorAttachments,
    colorFormats,
    sampleCount: Math.max(1, Math.ceil(descriptor.sampleCount ?? 1)),
    depth: descriptor.depth ?? 'none',
    colorSpace: descriptor.colorSpace ?? 'srgb',
    clearColors: descriptor.clearColors ? [...descriptor.clearColors] : [],
    clearDepth: descriptor.clearDepth ?? 1,
  };
}

const _tempInvLocal = createMatrix();
const _tempTranslation = createMatrix();
const _renderTargetAxisOrder: ReadonlyArray<keyof RenderTargetAxes> = [
  'width',
  'height',
  'format',
  'colorAttachments',
  'colorFormats',
  'sampleCount',
  'depth',
  'colorSpace',
];
