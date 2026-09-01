import { createCamera2D, projectCamera2DPoint } from '@flighthq/camera/contract';
import { createRectangle } from '@flighthq/geometry/contract';
import { enableInteractionSignals } from '@flighthq/interaction/contract';
import { createNode, getNodeChildByName, getNodeParent, removeNodeChild } from '@flighthq/node/contract';
import { createScene2D } from '@flighthq/scene2d/contract';
import { createSelectionState, selectAllNodes } from '@flighthq/selection/contract';
import { createShape } from '@flighthq/shape/contract';
import { connectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  GizmoCreateOptions,
  GizmoMode,
  GizmoNode2DFeatures,
  GizmoPivot,
  GizmoSignals,
  GizmoSpace,
  GizmoState,
  HierarchyNodeAny,
  Node2D,
  PointerEventData,
  Rectangle,
  Scene2D,
  SelectionState,
  Shape,
  Vector2Like,
} from '@flighthq/types/contract';

import {
  createGizmoState,
  disposeGizmoState,
  getGizmoMode,
  getGizmoSignals,
  getGizmoSpace,
  setGizmoCustomPivot,
  setGizmoMode,
  setGizmoPivot,
  setGizmoSelectionOutlineColor,
  setGizmoSelectionOutlineEnabled,
  setGizmoSnapRotation,
  setGizmoSnapScale,
  setGizmoSnapTranslate,
  setGizmoSpace,
  updateGizmo,
} from './gizmoState';

interface TestNodeFeatures {
  bounds: Rectangle;
  originX: number;
  originY: number;
  rotation: number;
}

interface TestContext {
  camera: ReturnType<typeof createCamera2D>;
  featuresByNode: Map<HierarchyNodeAny, TestNodeFeatures>;
  overlay: Scene2D;
  selection: SelectionState<HierarchyNodeAny>;
  state: GizmoState<HierarchyNodeAny>;
}

interface TestGizmoOptions {
  customPivotX?: number;
  customPivotY?: number;
  mode?: GizmoMode;
  pivot?: GizmoPivot;
  selectionOutlineColor?: number;
  selectionOutlineEnabled?: boolean;
  snapRotation?: number;
  snapScale?: number;
  snapTranslate?: number;
  space?: GizmoSpace;
}

describe('createGizmoState', () => {
  it('preserves generic hierarchy selection and creates the fixed semantic handle set', () => {
    const context = createTestContext();
    const root = getGizmoRoot(context.overlay);
    const handleRoot = getNodeChildByName(root, 'GizmoHandleRoot') as Node2D;

    expectTypeOf(context.state).toMatchTypeOf<GizmoState<HierarchyNodeAny>>();
    expectTypeOf<keyof GizmoCreateOptions<HierarchyNodeAny>>().toEqualTypeOf<
      'camera' | 'features' | 'overlayScene' | 'selection'
    >();
    expectTypeOf<
      Extract<
        keyof GizmoState<HierarchyNodeAny>,
        | 'customPivotX'
        | 'customPivotY'
        | 'mode'
        | 'pivot'
        | 'selectionOutlineColor'
        | 'selectionOutlineEnabled'
        | 'snapRotation'
        | 'snapScale'
        | 'snapTranslate'
        | 'space'
      >
    >().toEqualTypeOf<never>();
    expect(Object.keys(context.state)).toEqual([]);
    expect(getGizmoMode(context.state)).toBe('translate');
    expect(getNodeChildByName(handleRoot, 'GizmoRotateHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoTranslateXHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoTranslateYHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoTranslateXYHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleEastHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleWestHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleNorthHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleSouthHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleNortheastHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleNorthwestHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleSoutheastHandle')).not.toBeNull();
    expect(getNodeChildByName(handleRoot, 'GizmoScaleSouthwestHandle')).not.toBeNull();
  });
});

describe('disposeGizmoState', () => {
  it('detaches owned visuals, listeners, and references idempotently', () => {
    const context = createTestContext();
    const root = getGizmoRoot(context.overlay);
    const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');
    const began = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTransformBegin, began);

    disposeGizmoState(context.state);
    disposeGizmoState(context.state);
    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));

    expect(getNodeParent(root)).toBeNull();
    expect(began).not.toHaveBeenCalled();
    expect(() => updateGizmo(context.state)).not.toThrow();
  });

  it('also disposes cleanly after the caller has already detached the overlay root', () => {
    const context = createTestContext();
    const root = getGizmoRoot(context.overlay);
    removeNodeChild(context.overlay.root, root);

    expect(() => disposeGizmoState(context.state)).not.toThrow();
  });
});

describe('getGizmoMode', () => {
  it('returns the configured transform mode', () => {
    expect(getGizmoMode(createTestContext({ mode: 'scale' }).state)).toBe('scale');
  });
});

describe('getGizmoSignals', () => {
  it('exposes stable translate, rotate, scale, begin, and end signals', () => {
    const context = createTestContext();

    expectTypeOf<keyof GizmoSignals>().toEqualTypeOf<
      'onRotate' | 'onScale' | 'onTransformBegin' | 'onTransformEnd' | 'onTranslate'
    >();
    expect(getGizmoSignals(context.state)).toBe(getGizmoSignals(context.state));
    expect(getGizmoSignals(context.state)).toEqual({
      onRotate: expect.any(Object),
      onScale: expect.any(Object),
      onTransformBegin: expect.any(Object),
      onTransformEnd: expect.any(Object),
      onTranslate: expect.any(Object),
    });
  });

  it('brackets one active transform command with zero-argument begin and end signals', () => {
    const context = createTestContext();
    const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');
    const began = vi.fn();
    const ended = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTransformBegin, began);
    connectSignal(getGizmoSignals(context.state).onTransformEnd, ended);

    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));
    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));
    emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(172, 50, 2));
    expect(began).toHaveBeenCalledOnce();
    expect(began).toHaveBeenCalledWith();
    expect(ended).not.toHaveBeenCalled();

    emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(172, 50));
    emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(172, 50));
    expect(ended).toHaveBeenCalledOnce();
    expect(ended).toHaveBeenCalledWith();
  });
});

describe('getGizmoSpace', () => {
  it('returns the configured coordinate space', () => {
    expect(getGizmoSpace(createTestContext({ space: 'local' }).state)).toBe('local');
  });
});

describe('overlay and document transform parity', () => {
  const gestures = [
    {
      expected: [4, 3],
      handleName: 'GizmoTranslateXYHandle',
      mode: 'translate',
      worldEnd: { x: 6, y: 0 },
      worldStart: { x: 2, y: -3 },
    },
    {
      expected: [90],
      handleName: 'GizmoRotateHandle',
      mode: 'rotate',
      worldEnd: { x: 0, y: 10 },
      worldStart: { x: 10, y: 0 },
    },
    {
      expected: [1.5, 1.5],
      handleName: 'GizmoScaleNortheastHandle',
      mode: 'scale',
      worldEnd: { x: 15, y: 0 },
      worldStart: { x: 10, y: 0 },
    },
  ] as const;

  it.each(gestures)(
    'pins $mode output from one world gesture projected through identity and transformed cameras',
    (gesture) => {
      const identity = runProjectedWorldGesture(gesture, false);
      const transformed = runProjectedWorldGesture(gesture, true);

      expect(identity.delta).toEqual(gesture.expected);
      expect(transformed.delta).toEqual(gesture.expected);
      expect(transformed.delta).toEqual(identity.delta);
      for (const result of [identity, transformed]) {
        expect(result.began).toHaveBeenCalledOnce();
        expect(result.began).toHaveBeenCalledWith();
        expect(result.ended).toHaveBeenCalledOnce();
        expect(result.ended).toHaveBeenCalledWith();
        expect(result.nodeAfter).toEqual(result.nodeBefore);
      }
    },
  );
});

describe('setGizmoCustomPivot', () => {
  it('changes the custom world-coordinate pivot', () => {
    const context = createTestContext({ mode: 'scale', pivot: 'custom' });
    setGizmoCustomPivot(context.state, -10, 20);
    updateGizmo(context.state);
    expect(getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoHandleRoot')).toMatchObject({ x: 90, y: 70 });
  });
});

describe('setGizmoMode', () => {
  it('changes the active transform mode', () => {
    const context = createTestContext();
    setGizmoMode(context.state, 'rotate');
    expect(getGizmoMode(context.state)).toBe('rotate');
  });

  it('leaves an active command bracket intact when the mode is unchanged', () => {
    const context = createTestContext();
    const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');
    const ended = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTransformEnd, ended);
    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));

    setGizmoMode(context.state, 'translate');
    expect(ended).not.toHaveBeenCalled();

    emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(172, 50));
    expect(ended).toHaveBeenCalledOnce();
  });
});

describe('setGizmoPivot', () => {
  it('selects the rotate and scale pivot mode', () => {
    const context = createTestContext({ customPivotX: 12, customPivotY: 18, mode: 'rotate' });
    setGizmoPivot(context.state, 'custom');
    updateGizmo(context.state);
    expect(getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoHandleRoot')).toMatchObject({ x: 112, y: 68 });
  });
});

describe('setGizmoSelectionOutlineColor', () => {
  it('accepts packed RGBA outline color', () => {
    const context = createTestContext();
    setGizmoSelectionOutlineColor(context.state, 0x12345680);
    updateGizmo(context.state);
    const outline = getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoSelectionOutline') as Shape;
    expect(outline.data.commands).toEqual(expect.arrayContaining([0x123456, 0x80 / 0xff]));
  });
});

describe('setGizmoSelectionOutlineEnabled', () => {
  it('toggles the selection outline independently of the tool mode', () => {
    const context = createTestContext({ mode: 'none' });
    setGizmoSelectionOutlineEnabled(context.state, false);
    updateGizmo(context.state);
    expect(getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoSelectionOutline')).toMatchObject({
      visible: false,
    });
  });
});

describe('setGizmoSnapRotation', () => {
  it('sets degree snapping and accepts zero as off', () => {
    const context = createTestContext({ mode: 'rotate' });
    setGizmoSnapRotation(context.state, 15);
    expectRotationDelta(context, 22, 15);
    setGizmoSnapRotation(context.state, 0);
    expectRotationDelta(context, 22, 22);
  });
});

describe('setGizmoSnapScale', () => {
  it('sets multiplier snapping and accepts zero as off', () => {
    const context = createTestContext({ mode: 'scale' });
    setGizmoSnapScale(context.state, 0.25);
    expectScaleDelta(context, 1.4, 1.5);
    setGizmoSnapScale(context.state, 0);
    expectScaleDelta(context, 1.4, 1.4);
  });
});

describe('setGizmoSnapTranslate', () => {
  it('sets world-unit translation snapping and accepts zero as off', () => {
    const context = createTestContext();
    setGizmoSnapTranslate(context.state, 10);
    expectTranslationDelta(context, 13, 10);
    setGizmoSnapTranslate(context.state, 0);
    expectTranslationDelta(context, 13, 13);
  });

  it('treats invalid grid increments as disabled', () => {
    for (const step of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const context = createTestContext({ snapTranslate: step });
      expectTranslationDelta(context, -5, -5);
    }
  });
});

describe('setGizmoSpace', () => {
  it('changes the coordinate space', () => {
    const context = createTestContext();
    setGizmoSpace(context.state, 'local');
    expect(getGizmoSpace(context.state)).toBe('local');
  });
});

describe('updateGizmo', () => {
  it('combines multi-selection bounds, outlines them, and keeps handles in screen-space units', () => {
    const first = createTestNode();
    const second = createTestNode();
    const context = createTestContext({}, [first, second]);
    context.featuresByNode.set(first, createTestNodeFeatures(0, 0, 10, 10));
    context.featuresByNode.set(second, createTestNodeFeatures(20, 20, 10, 10));
    updateGizmo(context.state);
    const root = getGizmoRoot(context.overlay);
    const handleRoot = getNodeChildByName(root, 'GizmoHandleRoot') as Node2D;
    const outline = getNodeChildByName(root, 'GizmoSelectionOutline') as Shape;

    expect(handleRoot.x).toBeCloseTo(115, 8);
    expect(handleRoot.y).toBeCloseTo(65, 8);
    expect(outline.data.commands).toEqual(expect.arrayContaining(['moveTo', 2, 100, 50, 'lineTo', 2, 130, 50]));
    context.camera.zoom = 2;
    updateGizmo(context.state);
    expect(handleRoot.scaleX).toBe(1);
    expect(handleRoot.scaleY).toBe(1);
    expect(getGizmoHandle(context.overlay, 'GizmoTranslateXHandle').data.commands).toContain(72);
  });

  it('places edge and corner scale handles on the combined selection bounds', () => {
    const context = createTestContext({ mode: 'scale' });
    const node = getSelectedTestNode(context);
    context.featuresByNode.set(node, createTestNodeFeatures(-20, -10, 40, 20));

    updateGizmo(context.state);

    expect(getGizmoHandle(context.overlay, 'GizmoScaleEastHandle')).toMatchObject({ x: 20, y: 0 });
    expect(getGizmoHandle(context.overlay, 'GizmoScaleWestHandle')).toMatchObject({ x: -20, y: 0 });
    expect(getGizmoHandle(context.overlay, 'GizmoScaleNorthHandle')).toMatchObject({ x: 0, y: -10 });
    expect(getGizmoHandle(context.overlay, 'GizmoScaleSouthHandle')).toMatchObject({ x: 0, y: 10 });
    expect(getGizmoHandle(context.overlay, 'GizmoScaleNortheastHandle')).toMatchObject({ x: 20, y: -10 });
    expect(getGizmoHandle(context.overlay, 'GizmoScaleSouthwestHandle')).toMatchObject({ x: -20, y: 10 });
  });

  it('supports center, active-origin, and custom world pivots', () => {
    const first = createTestNode();
    const second = createTestNode();
    const context = createTestContext({}, [first, second]);
    context.featuresByNode.set(first, createTestNodeFeatures(0, 0, 10, 10, 2, 3));
    context.featuresByNode.set(second, createTestNodeFeatures(20, 20, 10, 10, 40, 50));
    const handleRoot = getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoHandleRoot') as Node2D;

    setGizmoMode(context.state, 'rotate');
    setGizmoPivot(context.state, 'origin');
    updateGizmo(context.state);
    expect(handleRoot.x).toBe(140);
    expect(handleRoot.y).toBe(100);
    setGizmoPivot(context.state, 'custom');
    setGizmoCustomPivot(context.state, -25, 12);
    updateGizmo(context.state);
    expect(handleRoot.x).toBe(75);
    expect(handleRoot.y).toBe(62);
    setGizmoPivot(context.state, 'center');
    updateGizmo(context.state);
    expect(handleRoot.x).toBe(115);
    expect(handleRoot.y).toBe(65);

    setGizmoMode(context.state, 'translate');
    setGizmoPivot(context.state, 'custom');
    updateGizmo(context.state);
    expect(handleRoot.x).toBe(115);
    expect(handleRoot.y).toBe(65);
  });

  it('orients world and local handles against camera rotation', () => {
    const node = createTestNode();
    const context = createTestContext({}, [node]);
    context.featuresByNode.set(node, createTestNodeFeatures(0, 0, 10, 10, 0, 0, 30));
    context.camera.rotation = 10 * (Math.PI / 180);
    const handleRoot = getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoHandleRoot') as Node2D;

    setGizmoSpace(context.state, 'world');
    updateGizmo(context.state);
    expect(handleRoot.rotation).toBe(0);
    setGizmoSpace(context.state, 'local');
    updateGizmo(context.state);
    expect(handleRoot.rotation).toBeCloseTo(20, 8);
    expect(getGizmoSpace(context.state)).toBe('local');
  });

  it('keeps world-space handles screen-aligned while emitting document-world deltas', () => {
    const context = createTestContext();
    context.camera.rotation = Math.PI * 0.5;
    updateGizmo(context.state);
    const translated = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTranslate, translated);
    const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');

    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));
    emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(182, 50));

    expect(translated.mock.calls.at(-1)?.[0]).toBeCloseTo(0, 8);
    expect(translated.mock.calls.at(-1)?.[1]).toBeCloseTo(10, 8);
  });

  it('keeps the outline available in none mode and cancels the active command bracket', () => {
    const context = createTestContext();
    const root = getGizmoRoot(context.overlay);
    const handleRoot = getNodeChildByName(root, 'GizmoHandleRoot') as Node2D;
    const outline = getNodeChildByName(root, 'GizmoSelectionOutline') as Shape;
    const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');
    const ended = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTransformEnd, ended);
    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));
    setGizmoMode(context.state, 'none');

    updateGizmo(context.state);

    expect(root.visible).toBe(true);
    expect(handleRoot.visible).toBe(false);
    expect(outline.visible).toBe(true);
    expect(ended).toHaveBeenCalledOnce();
    expect(ended).toHaveBeenCalledWith();
    setGizmoMode(context.state, 'translate');
    selectAllNodes(context.selection, []);
    updateGizmo(context.state);
    expect(root.visible).toBe(false);
  });

  it('supports runtime selection outline visibility and packed RGBA color', () => {
    const context = createTestContext();
    const outline = getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoSelectionOutline') as Shape;

    setGizmoSelectionOutlineEnabled(context.state, false);
    updateGizmo(context.state);
    expect(outline.visible).toBe(false);

    setGizmoSelectionOutlineColor(context.state, 0x12345680);
    setGizmoSelectionOutlineEnabled(context.state, true);
    updateGizmo(context.state);
    expect(outline.visible).toBe(true);
    expect(outline.data.commands).toEqual(expect.arrayContaining([0x123456, 0x80 / 0xff]));
  });

  it('cancels an active bracket when switching directly between transform modes', () => {
    const context = createTestContext();
    const ended = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTransformEnd, ended);
    const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');
    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));
    setGizmoMode(context.state, 'rotate');

    updateGizmo(context.state);

    expect(ended).toHaveBeenCalledOnce();
    expect(ended).toHaveBeenCalledWith();
    expect(getGizmoMode(context.state)).toBe('rotate');
  });

  it('skips selected nodes whose feature adapter cannot provide bounds', () => {
    const unavailable = createTestNode();
    const available = createTestNode();
    const context = createTestContext({}, [unavailable, available]);
    context.featuresByNode.delete(unavailable);
    context.featuresByNode.set(available, createTestNodeFeatures(20, 30, 10, 20));

    updateGizmo(context.state);

    const handleRoot = getNodeChildByName(getGizmoRoot(context.overlay), 'GizmoHandleRoot') as Node2D;
    expect(handleRoot.x).toBe(125);
    expect(handleRoot.y).toBe(90);
  });

  it('emits snapped translation deltas constrained to world and local axes', () => {
    const node = createTestNode();
    const context = createTestContext({}, [node]);
    context.featuresByNode.set(node, createTestNodeFeatures(0, 0, 0, 0, 0, 0, 90));
    setGizmoSnapTranslate(context.state, 10);
    updateGizmo(context.state);
    const translated = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTranslate, translated);
    const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');

    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));
    emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(185, 74));
    expect(translated).toHaveBeenLastCalledWith(10, 0);
    emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(185, 74));
    setGizmoSpace(context.state, 'local');
    updateGizmo(context.state);
    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(100, 122));
    emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(100, 135));
    expect(translated.mock.calls.at(-1)?.[0]).toBeCloseTo(0, 8);
    expect(translated.mock.calls.at(-1)?.[1]).toBeCloseTo(10, 8);
  });

  it('snaps the moved selection position to the grid in world and local axes', () => {
    const node = createTestNode();
    const context = createTestContext({}, [node]);
    const translated = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTranslate, translated);
    setGizmoSnapTranslate(context.state, 10);
    context.featuresByNode.set(node, createTestNodeFeatures(-13, 13, 0, 0, -13, 13, 90));
    context.camera.x = 25;
    context.camera.y = -40;
    context.camera.zoom = 2.5;
    updateGizmo(context.state);

    const xyHandle = getGizmoHandle(context.overlay, 'GizmoTranslateXYHandle');
    emitSignal(
      enableInteractionSignals(xyHandle).onPointerDown,
      createProjectedPointerData(context.camera, { x: -13, y: 13 }),
    );
    emitSignal(
      enableInteractionSignals(xyHandle).onPointerMove,
      createProjectedPointerData(context.camera, { x: -15, y: 17 }),
    );
    expect(translated).toHaveBeenLastCalledWith(-7, 7);
    emitSignal(
      enableInteractionSignals(xyHandle).onPointerUp,
      createProjectedPointerData(context.camera, { x: -15, y: 17 }),
    );

    setGizmoSpace(context.state, 'local');
    updateGizmo(context.state);
    const xHandle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');
    emitSignal(
      enableInteractionSignals(xHandle).onPointerDown,
      createProjectedPointerData(context.camera, { x: -13, y: 13 }),
    );
    emitSignal(
      enableInteractionSignals(xHandle).onPointerMove,
      createProjectedPointerData(context.camera, { x: -13, y: 17 }),
    );
    expect(translated.mock.calls.at(-1)?.[0]).toBeCloseTo(0, 8);
    expect(translated.mock.calls.at(-1)?.[1]).toBeCloseTo(7, 8);
  });

  it('supports free and y-axis translation without snapping', () => {
    const context = createTestContext();
    setGizmoSnapTranslate(context.state, 0);
    const translated = vi.fn();
    connectSignal(getGizmoSignals(context.state).onTranslate, translated);
    const yHandle = getGizmoHandle(context.overlay, 'GizmoTranslateYHandle');
    const xyHandle = getGizmoHandle(context.overlay, 'GizmoTranslateXYHandle');

    emitSignal(enableInteractionSignals(yHandle).onPointerDown, createPointerData(100, -22));
    emitSignal(enableInteractionSignals(yHandle).onPointerMove, createPointerData(113, -34));
    expect(translated).toHaveBeenLastCalledWith(0, -12);
    emitSignal(enableInteractionSignals(yHandle).onPointerUp, createPointerData(113, -34));
    emitSignal(enableInteractionSignals(xyHandle).onPointerDown, createPointerData(100, 50));
    emitSignal(enableInteractionSignals(xyHandle).onPointerMove, createPointerData(108, 61));
    expect(translated).toHaveBeenLastCalledWith(8, 11);
  });

  it('emits rotation deltas in degrees only and applies degree snapping', () => {
    const context = createTestContext({ mode: 'rotate' });
    setGizmoSnapRotation(context.state, 15);
    const rotated = vi.fn();
    connectSignal(getGizmoSignals(context.state).onRotate, rotated);
    const handle = getGizmoHandle(context.overlay, 'GizmoRotateHandle');

    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(152, 50));
    emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(100, 102));

    expect(rotated).toHaveBeenCalledWith(90);
  });

  it('normalizes rotation across the negative/positive angle seam before emitting degrees', () => {
    const context = createTestContext({ mode: 'rotate' });
    setGizmoSnapRotation(context.state, 0);
    const rotated = vi.fn();
    connectSignal(getGizmoSignals(context.state).onRotate, rotated);
    const handle = getGizmoHandle(context.overlay, 'GizmoRotateHandle');
    const radius = 52;
    const start = 170 * (Math.PI / 180);
    const current = -170 * (Math.PI / 180);

    emitSignal(
      enableInteractionSignals(handle).onPointerDown,
      createPointerData(100 + Math.cos(start) * radius, 50 + Math.sin(start) * radius),
    );
    emitSignal(
      enableInteractionSignals(handle).onPointerMove,
      createPointerData(100 + Math.cos(current) * radius, 50 + Math.sin(current) * radius),
    );

    expect(rotated).toHaveBeenCalledWith(20);

    emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(100, 50));
    emitSignal(
      enableInteractionSignals(handle).onPointerDown,
      createPointerData(100 + Math.cos(current) * radius, 50 + Math.sin(current) * radius),
    );
    emitSignal(
      enableInteractionSignals(handle).onPointerMove,
      createPointerData(100 + Math.cos(start) * radius, 50 + Math.sin(start) * radius),
    );
    expect(rotated).toHaveBeenLastCalledWith(-20);
  });

  it('emits snapped axis and uniform scale factors from the drag origin', () => {
    const context = createTestContext({ mode: 'scale' });
    setGizmoSnapScale(context.state, 0.25);
    const scaled = vi.fn();
    connectSignal(getGizmoSignals(context.state).onScale, scaled);
    const xHandle = getGizmoHandle(context.overlay, 'GizmoScaleEastHandle');
    const yHandle = getGizmoHandle(context.overlay, 'GizmoScaleNorthHandle');
    const xyHandle = getGizmoHandle(context.overlay, 'GizmoScaleNortheastHandle');

    emitSignal(enableInteractionSignals(xHandle).onPointerDown, createPointerData(172, 50));
    emitSignal(enableInteractionSignals(xHandle).onPointerMove, createPointerData(208, 50));
    expect(scaled).toHaveBeenLastCalledWith(1.5, 1);
    emitSignal(enableInteractionSignals(xHandle).onPointerUp, createPointerData(208, 50));
    emitSignal(enableInteractionSignals(xHandle).onPointerDown, createPointerData(172, 50));
    emitSignal(enableInteractionSignals(xHandle).onPointerMove, createPointerData(208, 50, 1, true));
    expect(scaled).toHaveBeenLastCalledWith(1.5, 1.5);
    emitSignal(enableInteractionSignals(xHandle).onPointerUp, createPointerData(208, 50));
    emitSignal(enableInteractionSignals(yHandle).onPointerDown, createPointerData(100, -22));
    emitSignal(enableInteractionSignals(yHandle).onPointerMove, createPointerData(100, -58, 1, true));
    expect(scaled).toHaveBeenLastCalledWith(1.5, 1.5);
    emitSignal(enableInteractionSignals(yHandle).onPointerUp, createPointerData(100, -58));
    emitSignal(enableInteractionSignals(xyHandle).onPointerDown, createPointerData(107, 57));
    emitSignal(enableInteractionSignals(xyHandle).onPointerMove, createPointerData(114, 64));
    expect(scaled).toHaveBeenLastCalledWith(2, 2);
  });

  it('supports y-axis scale and ignores pointer traffic from another identity', () => {
    const context = createTestContext({ mode: 'scale' });
    setGizmoSnapScale(context.state, 0);
    const scaled = vi.fn();
    connectSignal(getGizmoSignals(context.state).onScale, scaled);
    const handle = getGizmoHandle(context.overlay, 'GizmoScaleNorthHandle');

    emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(100, -22));
    emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(100, -58, 2));
    expect(scaled).not.toHaveBeenCalled();
    emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(100, -58));
    expect(scaled).toHaveBeenCalledWith(1, 1.5);
  });

  it('keeps neutral scale factors for degenerate drag origins', () => {
    const context = createTestContext({ mode: 'scale' });
    const scaled = vi.fn();
    connectSignal(getGizmoSignals(context.state).onScale, scaled);
    const xHandle = getGizmoHandle(context.overlay, 'GizmoScaleEastHandle');
    const yHandle = getGizmoHandle(context.overlay, 'GizmoScaleNorthHandle');
    const xyHandle = getGizmoHandle(context.overlay, 'GizmoScaleNortheastHandle');

    for (const handle of [xHandle, yHandle, xyHandle]) {
      emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(100, 50));
      emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(120, 70));
      expect(scaled).toHaveBeenLastCalledWith(1, 1);
      emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(120, 70));
    }
  });
});

function expectRotationDelta(context: Readonly<TestContext>, degrees: number, expected: number): void {
  const rotated = vi.fn();
  connectSignal(getGizmoSignals(context.state).onRotate, rotated);
  const handle = getGizmoHandle(context.overlay, 'GizmoRotateHandle');
  const radians = degrees * (Math.PI / 180);
  emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(152, 50));
  emitSignal(
    enableInteractionSignals(handle).onPointerMove,
    createPointerData(100 + Math.cos(radians) * 52, 50 + Math.sin(radians) * 52),
  );
  emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(100, 50));
  expect(rotated.mock.calls.at(-1)?.[0]).toBeCloseTo(expected, 8);
}

interface ProjectedWorldGesture {
  readonly expected: readonly number[];
  readonly handleName: string;
  readonly mode: Exclude<GizmoMode, 'none'>;
  readonly worldEnd: Readonly<Vector2Like>;
  readonly worldStart: Readonly<Vector2Like>;
}

function runProjectedWorldGesture(gesture: ProjectedWorldGesture, transformedCamera: boolean) {
  const node = createShape({
    pivotX: 2,
    pivotY: -3,
    rotation: 17,
    scaleX: 1.25,
    scaleY: 0.75,
    skewX: 4,
    skewY: -6,
    x: 12,
    y: -8,
  });
  const context = createTestContext({ mode: gesture.mode }, [node]);
  if (transformedCamera) {
    context.camera.x = 12;
    context.camera.y = -7;
    context.camera.zoom = 2.25;
    context.camera.rotation = 35 * (Math.PI / 180);
    updateGizmo(context.state);
  }
  const signals = getGizmoSignals(context.state);
  const began = vi.fn();
  const ended = vi.fn();
  const deltas: number[][] = [];
  connectSignal(signals.onTransformBegin, began);
  connectSignal(signals.onTransformEnd, ended);
  if (gesture.mode === 'translate') {
    connectSignal(signals.onTranslate, (x, y) => deltas.push([roundTransformValue(x), roundTransformValue(y)]));
  } else if (gesture.mode === 'rotate') {
    connectSignal(signals.onRotate, (degrees) => deltas.push([roundTransformValue(degrees)]));
  } else {
    connectSignal(signals.onScale, (x, y) => deltas.push([roundTransformValue(x), roundTransformValue(y)]));
  }
  const nodeBefore = snapshotNodeTransform(node);
  const handle = getGizmoHandle(context.overlay, gesture.handleName);

  emitSignal(
    enableInteractionSignals(handle).onPointerDown,
    createProjectedPointerData(context.camera, gesture.worldStart),
  );
  emitSignal(
    enableInteractionSignals(handle).onPointerMove,
    createProjectedPointerData(context.camera, gesture.worldEnd),
  );
  emitSignal(
    enableInteractionSignals(handle).onPointerUp,
    createProjectedPointerData(context.camera, gesture.worldEnd),
  );

  const result = {
    began,
    delta: deltas.at(-1),
    ended,
    nodeAfter: snapshotNodeTransform(node),
    nodeBefore,
  };
  disposeGizmoState(context.state);
  return result;
}

function createProjectedPointerData(
  camera: Readonly<ReturnType<typeof createCamera2D>>,
  world: Readonly<Vector2Like>,
): PointerEventData {
  const overlay = { x: 0, y: 0 };
  projectCamera2DPoint(camera, world.x, world.y, overlay);
  return { ...createPointerData(overlay.x, overlay.y), worldX: world.x, worldY: world.y };
}

function snapshotNodeTransform(node: Readonly<Node2D>) {
  return {
    pivotX: node.pivotX,
    pivotY: node.pivotY,
    rotation: node.rotation,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    skewX: node.skewX,
    skewY: node.skewY,
    x: node.x,
    y: node.y,
  };
}

function roundTransformValue(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

function expectScaleDelta(context: Readonly<TestContext>, scale: number, expected: number): void {
  const scaled = vi.fn();
  connectSignal(getGizmoSignals(context.state).onScale, scaled);
  const handle = getGizmoHandle(context.overlay, 'GizmoScaleEastHandle');
  emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(110, 50));
  emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(100 + 10 * scale, 50));
  emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(100, 50));
  expect(scaled.mock.calls.at(-1)?.[0]).toBeCloseTo(expected, 8);
}

function expectTranslationDelta(context: Readonly<TestContext>, deltaX: number, expected: number): void {
  const translated = vi.fn();
  connectSignal(getGizmoSignals(context.state).onTranslate, translated);
  const handle = getGizmoHandle(context.overlay, 'GizmoTranslateXHandle');
  emitSignal(enableInteractionSignals(handle).onPointerDown, createPointerData(172, 50));
  emitSignal(enableInteractionSignals(handle).onPointerMove, createPointerData(172 + deltaX, 50));
  emitSignal(enableInteractionSignals(handle).onPointerUp, createPointerData(100, 50));
  expect(translated.mock.calls.at(-1)?.[0]).toBeCloseTo(expected, 8);
}

function createPointerData(x: number, y: number, pointerId: number = 1, shiftKey: boolean = false): PointerEventData {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    ctrlKey: false,
    currentTarget: null,
    deltaX: 0,
    deltaY: 0,
    localX: x,
    localY: y,
    metaKey: false,
    pointerId,
    pointerType: 'mouse',
    shiftKey,
    target: null,
    worldX: x,
    worldY: y,
    x,
    y,
  };
}

function createTestContext(
  options: Readonly<TestGizmoOptions> = {},
  nodes: readonly HierarchyNodeAny[] = [createTestNode()],
): TestContext {
  const camera = createCamera2D(200, 100);
  const overlay = createScene2D({ scene2dHeight: 100, scene2dWidth: 200 });
  const selection = createSelectionState<HierarchyNodeAny>();
  const featuresByNode = new Map<HierarchyNodeAny, TestNodeFeatures>();
  for (let i = 0; i < nodes.length; i++) {
    featuresByNode.set(nodes[i], createTestNodeFeatures(0, 0, 0, 0));
  }
  selectAllNodes(selection, nodes);
  const features: GizmoNode2DFeatures<HierarchyNodeAny> = {
    getWorldBoundsRectangle: (out: Rectangle, node: Readonly<HierarchyNodeAny>) => {
      const value = featuresByNode.get(node);
      if (value === undefined) return false;
      out.x = value.bounds.x;
      out.y = value.bounds.y;
      out.width = value.bounds.width;
      out.height = value.bounds.height;
      return true;
    },
    getWorldOrigin: (out: Vector2Like, node: Readonly<HierarchyNodeAny>) => {
      const value = featuresByNode.get(node)!;
      out.x = value.originX;
      out.y = value.originY;
    },
    getWorldRotation: (node: Readonly<HierarchyNodeAny>) => featuresByNode.get(node)!.rotation,
  };
  const state = createGizmoState({ camera, features, overlayScene: overlay, selection });
  applyTestGizmoOptions(state, options);
  updateGizmo(state);
  return { camera, featuresByNode, overlay, selection, state };
}

function applyTestGizmoOptions(state: GizmoState<HierarchyNodeAny>, options: Readonly<TestGizmoOptions>): void {
  if (options.customPivotX !== undefined || options.customPivotY !== undefined)
    setGizmoCustomPivot(state, options.customPivotX ?? 0, options.customPivotY ?? 0);
  if (options.mode !== undefined) setGizmoMode(state, options.mode);
  if (options.pivot !== undefined) setGizmoPivot(state, options.pivot);
  if (options.selectionOutlineColor !== undefined) setGizmoSelectionOutlineColor(state, options.selectionOutlineColor);
  if (options.selectionOutlineEnabled !== undefined)
    setGizmoSelectionOutlineEnabled(state, options.selectionOutlineEnabled);
  if (options.snapRotation !== undefined) setGizmoSnapRotation(state, options.snapRotation);
  if (options.snapScale !== undefined) setGizmoSnapScale(state, options.snapScale);
  if (options.snapTranslate !== undefined) setGizmoSnapTranslate(state, options.snapTranslate);
  if (options.space !== undefined) setGizmoSpace(state, options.space);
}

function createTestNode(): HierarchyNodeAny {
  return createNode('GizmoTestNode');
}

function getSelectedTestNode(context: Readonly<TestContext>): HierarchyNodeAny {
  return [...context.featuresByNode.keys()][0];
}

function createTestNodeFeatures(
  x: number,
  y: number,
  width: number,
  height: number,
  originX: number = x + width * 0.5,
  originY: number = y + height * 0.5,
  rotation: number = 0,
): TestNodeFeatures {
  return { bounds: createRectangle(x, y, width, height), originX, originY, rotation };
}

function getGizmoHandle(overlay: Scene2D, name: string): Shape {
  const handleRoot = getNodeChildByName(getGizmoRoot(overlay), 'GizmoHandleRoot') as Node2D;
  return getNodeChildByName(handleRoot, name) as Shape;
}

function getGizmoRoot(overlay: Scene2D): Node2D {
  return getNodeChildByName(overlay.root, 'GizmoRoot') as Node2D;
}
