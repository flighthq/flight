import { LottieLayerKind, LottieMaskKind, LottieShapeItemKind } from '@flighthq/types/contract';

export function collectLottieCounts(json: string): Map<string, number> | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  if (!isLottieDocument(record)) return null;
  const layers = record.layers as unknown[];
  const counts = new Map<string, number>();
  for (const layer of layers) {
    if (layer === null || typeof layer !== 'object') continue;
    const entry = layer as Record<string, unknown>;
    const ty = entry.ty;
    if (typeof ty !== 'number') continue;
    const kind = layerKindName(ty);
    if (kind !== null) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (ty === LottieLayerKind.Shape) {
      tallyShapeItems(counts, entry.shapes);
    }
    tallyMasks(counts, entry.masksProperties);
  }
  return counts;
}

/**
 * Tallies the masks Flight has a family for.
 *
 * ★ ONLY THE ADDITIVE MODE IS COUNTED, and that is a reporting limit rather than a claim about the document. Lottie
 * declares seven modes and Flight carries one, so a subtract or intersect mask requires something no catalog row can
 * satisfy; emitting a key for it would produce a requirement nothing resolves. A document carrying one is imported
 * unmasked and silently, exactly as before masks became a family — the gap is recorded in
 * agents/scene2d-format-coverage.md, not papered over with a key.
 */
function tallyMasks(counts: Map<string, number>, raw: unknown): void {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    if ((entry as Record<string, unknown>).mode !== LottieMaskKind.Additive) continue;
    counts.set('mask.additive', (counts.get('mask.additive') ?? 0) + 1);
  }
}

function isLottieDocument(record: Readonly<Record<string, unknown>>): boolean {
  return (
    Array.isArray(record.layers) &&
    typeof record.fr === 'number' &&
    record.fr > 0 &&
    typeof record.ip === 'number' &&
    typeof record.op === 'number'
  );
}

function layerKindName(ty: number): string | null {
  switch (ty) {
    case LottieLayerKind.Precomposition:
      return 'layer.precomposition';
    case LottieLayerKind.Solid:
      return 'layer.solid';
    case LottieLayerKind.Image:
      return 'layer.image';
    case LottieLayerKind.Null:
      return 'layer.null';
    case LottieLayerKind.Shape:
      return 'layer.shape';
    case LottieLayerKind.Text:
      return 'layer.text';
    default:
      return null;
  }
}

function shapeItemKindName(ty: string): string | null {
  switch (ty) {
    case LottieShapeItemKind.Ellipse:
      return 'shape.ellipse';
    case LottieShapeItemKind.Fill:
      return 'shape.fill';
    case LottieShapeItemKind.GradientFill:
      return 'shape.gradientFill';
    case LottieShapeItemKind.GradientStroke:
      return 'shape.gradientStroke';
    case LottieShapeItemKind.Path:
      return 'shape.path';
    case LottieShapeItemKind.Polystar:
      return 'shape.polystar';
    case LottieShapeItemKind.Rectangle:
      return 'shape.rectangle';
    case LottieShapeItemKind.Stroke:
      return 'shape.stroke';
    case LottieShapeItemKind.TrimPath:
      return 'shape.trimPath';
    default:
      return null;
  }
}

function tallyShapeItems(counts: Map<string, number>, raw: unknown): void {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const ty = item.ty;
    if (typeof ty === 'string') {
      const kind = shapeItemKindName(ty);
      if (kind !== null) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    if (ty === 'gr') {
      tallyShapeItems(counts, item.it);
    }
  }
}
