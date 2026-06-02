import type { PartialNode, SceneNode, SceneNodeData, SceneNodeRuntime } from '@flighthq/types';

import {
  createSceneNode,
  createSceneNodeRuntime,
  createSceneSignals,
  defaultSceneNodeRuntimeCanAddChild,
  getSceneNodeRuntime,
  getSceneSignals,
  setSceneNodeEnabled,
  setSceneNodeResolver,
} from './sceneNode';

describe('createSceneNode', () => {
  let node: SceneNode<typeof TestGraph>;

  beforeEach(() => {
    node = createSceneNode(TestGraph, NodeTestKind);
  });

  it('initializes default values', () => {
    expect(node.enabled).toBe(true);
    expect(getSceneNodeRuntime(node).graph).toStrictEqual(TestGraph);
  });

  it('allows pre-defined values', () => {
    const base = {
      parent: createSceneNode(TestGraph, NodeTestKind),
      children: [],
      enabled: false,
    };
    node = createSceneNode(TestGraph, NodeTestKind, base);
    expect(node.enabled).toStrictEqual(base.enabled);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    node = createSceneNode(TestGraph, NodeTestKind, base);
    expect(node).not.toStrictEqual(base);
  });

  it('allows creation of a type without a data field', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    expect(node.data).toBeNull();
  });

  it('makes a default runtime object if none passed in', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    const runtime = getSceneNodeRuntime(node);
    expect(runtime).not.toBeNull();
  });

  it('allows a custom type', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    expect(node.kind).toBe(NodeTestKind);
  });

  it('returns a new object', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node: NodeTest<typeof TestGraph> = createSceneNode(TestGraph, NodeTestKind, obj) as NodeTest<
      typeof TestGraph
    >;
    expect(node).not.toStrictEqual(obj);
  });

  it('allows use of a data initializer', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node: NodeTest<typeof TestGraph> = createSceneNode(
      TestGraph,
      NodeTestKind,
      obj,
      createGraphNodeTestData,
    ) as NodeTest<typeof TestGraph>;
    expect((node.data as NodeTestData).testDataField).toBe('testDataField');
  });

  it('allows use of a runtime initializer', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node = createSceneNode(TestGraph, NodeTestKind, obj, undefined, createGraphNodeTestRuntime);
    const runtime = getSceneNodeRuntime(node);
    expect((runtime as NodeTestRuntime<typeof TestGraph>).testRuntimeField).toBe('testRuntimeField');
  });
});

describe('createSceneNodeRuntime', () => {
  let runtime: SceneNodeRuntime<typeof TestGraph>;

  beforeEach(() => {
    runtime = createSceneNodeRuntime();
  });

  it('initializes default values', () => {
    expect(runtime.appearanceID).toStrictEqual(0);
    expect(runtime.boundsUsingLocalBoundsID).toStrictEqual(-1);
    expect(runtime.boundsUsingLocalTransformID).toStrictEqual(-1);
    expect(runtime.children).toBeNull();
    expect(runtime.sceneSignals).toBeDefined();
    expect(runtime.resolver).toBeNull();
    expect(runtime.localBoundsID).toStrictEqual(0);
    expect(runtime.localBoundsUsingLocalBoundsID).toStrictEqual(-1);
    expect(runtime.localTransformID).toStrictEqual(0);
    expect(runtime.localTransformUsingLocalTransformID).toStrictEqual(-1);
    expect(runtime.parent).toBeNull();
    expect(runtime.worldBoundsUsingLocalBoundsID).toStrictEqual(-1);
    expect(runtime.worldBoundsUsingWorldTransformID).toStrictEqual(-1);
    expect(runtime.worldTransformID).toStrictEqual(0);
    expect(runtime.worldTransformUsingLocalTransformID).toStrictEqual(-1);
    expect(runtime.worldTransformUsingParentTransformID).toStrictEqual(-1);
    expect(runtime.canAddChild).toStrictEqual(defaultSceneNodeRuntimeCanAddChild);
  });

  it('does not initialize graph', () => {
    // done in createSceneNode constructor
    expect(runtime.graph).toBeUndefined();
  });

  it('allows custom canAddChild', () => {
    const methods = {
      canAddChild: (_parent: SceneNode<typeof TestGraph>, _child: SceneNode<typeof TestGraph>) => true,
    };
    runtime = createSceneNodeRuntime(methods);
    expect(runtime.canAddChild).toStrictEqual(methods.canAddChild);
  });
});

describe('createSceneSignals', () => {
  it('returns an object with all signal properties', () => {
    const signals = createSceneSignals();
    expect(signals.onChildAdded).toBeDefined();
    expect(signals.onChildRemoved).toBeDefined();
    expect(signals.onChildrenChanged).toBeDefined();
    expect(signals.onChildrenOrderChanged).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
  });
});

describe('defaultSceneNodeRuntimeCanAddChild', () => {
  it('always returns true', () => {
    const parent = createSceneNode(TestGraph, NodeTestKind);
    const child = createSceneNode(TestGraph, NodeTestKind);
    expect(defaultSceneNodeRuntimeCanAddChild(parent, child)).toBe(true);
  });
});

describe('getSceneNodeRuntime', () => {
  it('assumes runtime is defined', () => {
    const node = { kind: NodeTestKind };
    const runtime = getSceneNodeRuntime(node as SceneNode<typeof TestGraph>);
    expect(runtime).toBeUndefined();
  });

  it('returns runtime when defined', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    const runtime = getSceneNodeRuntime(node);
    expect(runtime).not.toBeUndefined();
  });
});

describe('getSceneSignals', () => {
  it('returns the signals object', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    const signals = getSceneSignals(node);
    expect(signals).toBeDefined();
    expect(signals.onChildrenChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    expect(getSceneSignals(node)).toBe(getSceneSignals(node));
  });
});

describe('setSceneNodeEnabled', () => {
  it('sets enabled to false', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    setSceneNodeEnabled(node, false);
    expect(node.enabled).toBe(false);
  });

  it('sets enabled back to true', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    setSceneNodeEnabled(node, false);
    setSceneNodeEnabled(node, true);
    expect(node.enabled).toBe(true);
  });
});

describe('setSceneNodeResolver', () => {
  it('sets the runtime resolver', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    const resolver = { resolve: vi.fn(), updateChildren: false };
    setSceneNodeResolver(node, resolver);
    expect(getSceneNodeRuntime(node).resolver).toBe(resolver);
  });

  it('accepts null', () => {
    const node = createSceneNode(TestGraph, NodeTestKind);
    const resolver = { resolve: vi.fn(), updateChildren: false };
    setSceneNodeResolver(node, resolver);
    setSceneNodeResolver(node, null);
    expect(getSceneNodeRuntime(node).resolver).toBeNull();
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');

const NodeTestKind: unique symbol = Symbol('NodeTest');

interface NodeTest<SceneKind extends symbol> extends SceneNode<SceneKind> {
  data: NodeTestData;
}

interface NodeTestData extends SceneNodeData {
  testDataField: string;
}

interface NodeTestRuntime<SceneKind extends symbol> extends SceneNodeRuntime<SceneKind> {
  testRuntimeField: string;
}

function createGraphNodeTestData(data?: Partial<NodeTestData>): NodeTestData {
  return {
    testDataField: data?.testDataField ?? 'testDataField',
  };
}

function createGraphNodeTestRuntime<SceneKind extends symbol>(): NodeTestRuntime<SceneKind> {
  const obj = createSceneNodeRuntime() as NodeTestRuntime<SceneKind>;
  obj.testRuntimeField = 'testRuntimeField';
  return obj;
}
