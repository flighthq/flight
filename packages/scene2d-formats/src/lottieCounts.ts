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
    const kind = LOTTIE_LAYER_FEATURES.get(ty);
    if (kind !== undefined) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (ty === LottieLayerKind.Shape) {
      tallyShapeItems(counts, entry.shapes);
    }
    tallyMasks(counts, entry.masksProperties);
  }
  return counts;
}

/**
 * Every `document.format` feature this analyzer can report, which is the population the catalog's disposition gate
 * partitions.
 *
 * ★ DERIVED FROM THE SAME TABLES THE CENSUS READS, never written out beside them. A hand-written list would shrink
 * silently when a feature was added — and the gate that asserts "every analyzed feature is either claimed by a handler
 * or declined with a reason" would then pass by looking at less.
 *
 * A FUNCTION, NOT A CONST, because the tables it reads live at the bottom of the file where loose module variables
 * belong — a top-level const initializer would run before them and see `undefined`. `getThreeDsFeatureNames` exists for
 * the same reason.
 */
export function getLottieFeatureNames(): readonly string[] {
  return [
    ...LOTTIE_LAYER_FEATURES.values(),
    ...LOTTIE_MASK_FEATURES.values(),
    ...LOTTIE_MASK_CONDITION_FEATURES,
    ...LOTTIE_SHAPE_ITEM_FEATURES.values(),
  ].sort();
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

/**
 * Tallies a layer's masks by composition mode, and the two CONDITIONS on a mask that Flight cannot carry either.
 *
 * ★ EVERY MODE BUT `None` IS A FEATURE; `None` IS THE ABSENCE OF ONE. Lottie writes `mode: 'n'` for a mask entry that is
 * switched off, so counting it would report a requirement for something the document is not asking for. The other five
 * are reported even though Flight carries only the additive one: the catalog declines them by disposition, which is how
 * a reader learns the document needs something rather than learning nothing.
 *
 * ★ AND A MODE FLIGHT CARRIES CAN STILL ARRIVE IN A SHAPE IT CANNOT. `mask.additive` resolves to a real handler, but that
 * handler declines an INVERTED mask and declines a layer carrying MORE THAN ONE active mask — so a document using either
 * imports unmasked while its only requirement resolves cleanly. These two keys are what make that visible. They are
 * conditions rather than modes, which is why they are not in the mode table: `inv: true` can appear on any mode, and
 * "more than one" is a property of the list.
 *
 * "Active" here has to mean what the importer means by it — mode other than `None` — or the census would report a
 * condition the parser never reaches.
 */
function tallyMasks(counts: Map<string, number>, raw: unknown): void {
  if (!Array.isArray(raw)) return;
  let active = 0;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const mask = entry as Record<string, unknown>;
    const mode = mask.mode;
    if (typeof mode !== 'string' || mode === LottieMaskKind.None) continue;
    active++;
    const kind = LOTTIE_MASK_FEATURES.get(mode);
    if (kind !== undefined) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (mask.inv === true) counts.set(LOTTIE_MASK_INVERTED, (counts.get(LOTTIE_MASK_INVERTED) ?? 0) + 1);
  }
  // Counted once per layer, because the condition is the layer having several — not each mask being one of several.
  if (active > 1) counts.set(LOTTIE_MASK_MULTIPLE, (counts.get(LOTTIE_MASK_MULTIPLE) ?? 0) + 1);
}

function tallyShapeItems(counts: Map<string, number>, raw: unknown): void {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const ty = item.ty;
    if (typeof ty === 'string') {
      const kind = LOTTIE_SHAPE_ITEM_FEATURES.get(ty);
      if (kind !== undefined) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    if (ty === 'gr') {
      tallyShapeItems(counts, item.it);
    }
  }
}

const LOTTIE_LAYER_FEATURES = new Map<number, string>([
  [LottieLayerKind.Image, 'layer.image'],
  [LottieLayerKind.Null, 'layer.null'],
  [LottieLayerKind.Precomposition, 'layer.precomposition'],
  [LottieLayerKind.Shape, 'layer.shape'],
  [LottieLayerKind.Solid, 'layer.solid'],
  [LottieLayerKind.Text, 'layer.text'],
]);

const LOTTIE_MASK_INVERTED = 'mask.inverted';

const LOTTIE_MASK_MULTIPLE = 'mask.multiple';

const LOTTIE_MASK_CONDITION_FEATURES: readonly string[] = [LOTTIE_MASK_INVERTED, LOTTIE_MASK_MULTIPLE];

const LOTTIE_MASK_FEATURES = new Map<string, string>([
  [LottieMaskKind.Additive, 'mask.additive'],
  [LottieMaskKind.Darken, 'mask.darken'],
  [LottieMaskKind.Difference, 'mask.difference'],
  [LottieMaskKind.Intersect, 'mask.intersect'],
  [LottieMaskKind.Lighten, 'mask.lighten'],
  [LottieMaskKind.Subtract, 'mask.subtract'],
]);

const LOTTIE_SHAPE_ITEM_FEATURES = new Map<string, string>([
  [LottieShapeItemKind.Ellipse, 'shape.ellipse'],
  [LottieShapeItemKind.Fill, 'shape.fill'],
  [LottieShapeItemKind.GradientFill, 'shape.gradientFill'],
  [LottieShapeItemKind.GradientStroke, 'shape.gradientStroke'],
  [LottieShapeItemKind.Path, 'shape.path'],
  [LottieShapeItemKind.Polystar, 'shape.polystar'],
  [LottieShapeItemKind.Rectangle, 'shape.rectangle'],
  [LottieShapeItemKind.Stroke, 'shape.stroke'],
  [LottieShapeItemKind.TrimPath, 'shape.trimPath'],
]);
