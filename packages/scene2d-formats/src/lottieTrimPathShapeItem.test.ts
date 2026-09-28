import type {
  ImportDiagnostic,
  LottieLayer,
  LottieRegistry,
  LottieShapeItemHandler,
  LottieShapeItemKind,
  Shape,
} from '@flighthq/types/contract';
import { LottieLayerKind, LottieShapeItemKind as Kind, ShapeKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createScene2DFromLottieDocumentWithRegistry } from './lottieDocument.ts';
import { lottieFillShapeItemHandler } from './lottieFillShapeItem.ts';
import { createScene2DFromLottieDocument } from './lottieImport.ts';
import { lottiePathShapeItemHandler } from './lottiePathShapeItem.ts';
import { createLottieRegistry, getLottieShapeItemHandler } from './lottieRegistry.ts';
import { registerLottieShapeItemHandlers } from './lottieShapeItemHandlers.ts';
import { lottieShapeLayerHandler } from './lottieShapeLayer.ts';
import { createLottieTestDocument, findLottieTestNodeByKind, lottieTestSquarePath } from './lottieTestFixtures.ts';
import { lottieTrimPathShapeItemHandler } from './lottieTrimPathShapeItem.ts';

// The registration check the family test also makes, kept here so each item's test can assert BOTH halves of its
// identity: that the handler behaves, and that the zero-config family installs this exact function for its kind.
function expectRegisteredShapeItem(kind: LottieShapeItemKind, handler: LottieShapeItemHandler): void {
  const registry = createLottieRegistry();
  registerLottieShapeItemHandlers(registry);
  expect(getLottieShapeItemHandler(registry, kind)).toBe(handler);
}

describe('lottieTrimPathShapeItemHandler', () => {
  it('is the built-in TrimPath shape item handler', () => {
    expectRegisteredShapeItem(Kind.TrimPath, lottieTrimPathShapeItemHandler);
  });

  // ★ THE TRIM HAS TO BE VISIBLE IN THE PATH, NOT IN THE TREE. The assertion this replaces checked that a trimmed layer
  // still produced a Shape node, which is true of an untrimmed one too — it would have passed with the trimming deleted.
  // Every case below reads the drawn command list and compares it against the SAME document without the trim.
  it('shortens every path in its group', () => {
    expect(pathCommandsOf([halfTrim()])).not.toEqual(pathCommandsOf([]));
    expect(pathCommandsOf([halfTrim()]).length).toBeLessThan(pathCommandsOf([]).length);
  });

  // ★ ONE TRIM PER GROUP, ON BOTH PATHS. Lottie applies a group's trim once: a second trim item is IGNORED, not composed
  // with the first. The rule used to live in the shape layer, which took `items.find`; it now lives in this handler,
  // which claims the group before doing anything. Both entries are pinned because they reach the handler differently —
  // the zero-config wrapper resolves the family for you, the selective entry takes the registry you built — and a claim
  // that leaked into module scope would pass one and fail the other, or pass both and fail across two documents.
  it('ignores a second trim in the same group rather than composing with it', () => {
    const once = pathCommandsOf([halfTrim()]);
    expect(pathCommandsOf([halfTrim(), halfTrim()])).toEqual(once);
    expect(pathCommandsOf([halfTrim(), halfTrim(), halfTrim()])).toEqual(once);
  });

  it('ignores a second trim on the selective entry too, and does not carry the claim between documents', () => {
    const registry: LottieRegistry = {
      layerHandlers: [{ handle: lottieShapeLayerHandler, kind: LottieLayerKind.Shape }],
      maskHandlers: [],
      shapeItemHandlers: [
        { handle: lottieFillShapeItemHandler, kind: Kind.Fill },
        { handle: lottiePathShapeItemHandler, kind: Kind.Path },
        { handle: lottieTrimPathShapeItemHandler, kind: Kind.TrimPath },
      ],
    };
    const once = selectivePathCommands(registry, [halfTrim()]);
    expect(selectivePathCommands(registry, [halfTrim(), halfTrim()])).toEqual(once);
    // A second document through the SAME registry must trim again: the claim belongs to the group, not to the handler.
    expect(selectivePathCommands(registry, [halfTrim()])).toEqual(once);
    expect(once).not.toEqual(selectivePathCommands(registry, []));
  });

  // A trim spanning the whole path keeps the whole path, so the handler pushes no modifier at all — which is why the
  // command list has to come back IDENTICAL rather than merely similar.
  it('leaves the paths untouched when the span covers the whole path', () => {
    expect(pathCommandsOf([{ e: { k: 100 }, o: { k: 0 }, s: { k: 0 }, ty: 'tm' }])).toEqual(pathCommandsOf([]));
  });

  // ★ ANIMATED TRIM IS A SKIP, AND THE PATHS STAY WHOLE. Flight trims once at import, so a keyframed span cannot be
  // carried; reporting it and leaving the path alone is better than freezing it at one frame. Both halves are asserted
  // because either alone would pass a handler that did the wrong thing quietly.
  it('reports a skip for an animated span and leaves the paths whole', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const animated = pathCommandsOf(
      [
        {
          e: {
            a: 1,
            k: [
              { s: 0, t: 0 },
              { s: 50, t: 30 },
            ],
          },
          o: { k: 0 },
          s: { k: 0 },
          ty: 'tm',
        },
      ],
      diagnostics,
    );
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['lottie.unsupported-shape-modifier']);
    expect(animated).toEqual(pathCommandsOf([]));
  });
});

function halfTrim() {
  return { e: { k: 50 }, o: { k: 0 }, s: { k: 0 }, ty: 'tm' };
}

function selectivePathCommands(registry: Readonly<LottieRegistry>, trims: readonly unknown[]): readonly number[] {
  const result = createScene2DFromLottieDocumentWithRegistry(createLottieTestDocument([trimmedLayer(trims)]), registry);
  return drawnPathCommands(result.root);
}

function trimmedLayer(trims: readonly unknown[]): LottieLayer {
  return {
    ind: 1,
    ip: 0,
    nm: 'trim',
    op: 60,
    shapes: [
      { ks: { k: lottieTestSquarePath(0, 0, 10) }, ty: 'sh' },
      { c: { k: [1, 0, 0] }, o: { k: 100 }, ty: 'fl' },
      ...trims,
    ],
    ty: 4,
  } as unknown as LottieLayer;
}

function drawnPathCommands(root: Parameters<typeof findLottieTestNodeByKind>[0]): readonly number[] {
  const shape = findLottieTestNodeByKind(root, ShapeKind) as Shape | null;
  expect(shape).not.toBeNull();
  const commands = shape!.data.commands as unknown[];
  const at = commands.indexOf('drawPath');
  expect(at).toBeGreaterThanOrEqual(0);
  return commands[at + 2] as readonly number[];
}

function pathCommandsOf(trims: readonly unknown[], diagnostics?: ImportDiagnostic[]): readonly number[] {
  const result = createScene2DFromLottieDocument(createLottieTestDocument([trimmedLayer(trims)]), diagnostics);
  return drawnPathCommands(result.root);
}
