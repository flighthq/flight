import type { Node, NodeData, NodeRuntime, PartialNode } from '@flighthq/types';

import {
  createNode,
  createNodeRuntime,
  createNodeSignals,
  defaultNodeRuntimeCanAddChild,
  getNodeRuntime,
  getNodeSignals,
  setNodeEnabled,
} from './node';

describe('createNode', () => {
  let node: Node<typeof TestGraph>;

  beforeEach(() => {
    node = createNode(TestGraph, NodeTestKind);
  });

  it('initializes default values', () => {
    expect(node.enabled).toBe(true);
    expect(getNodeRuntime(node).graph).toStrictEqual(TestGraph);
  });

  it('allows pre-defined values', () => {
    const base = {
      parent: createNode(TestGraph, NodeTestKind),
      children: [],
      enabled: false,
    };
    node = createNode(TestGraph, NodeTestKind, base);
    expect(node.enabled).toStrictEqual(base.enabled);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    node = createNode(TestGraph, NodeTestKind, base);
    expect(node).not.toStrictEqual(base);
  });

  it('allows creation of a type without a data field', () => {
    const node = createNode(TestGraph, NodeTestKind);
    expect(node.data).toBeNull();
  });

  it('makes a default runtime object if none passed in', () => {
    const node = createNode(TestGraph, NodeTestKind);
    const runtime = getNodeRuntime(node);
    expect(runtime).not.toBeNull();
  });

  it('allows a custom type', () => {
    const node = createNode(TestGraph, NodeTestKind);
    expect(node.kind).toBe(NodeTestKind);
  });

  it('returns a new object', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node: NodeTest<typeof TestGraph> = createNode(TestGraph, NodeTestKind, obj) as NodeTest<typeof TestGraph>;
    expect(node).not.toStrictEqual(obj);
  });

  it('allows use of a data initializer', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node: NodeTest<typeof TestGraph> = createNode(
      TestGraph,
      NodeTestKind,
      obj,
      createGraphNodeTestData,
    ) as NodeTest<typeof TestGraph>;
    expect((node.data as NodeTestData).testDataField).toBe('testDataField');
  });

  it('allows use of a runtime initializer', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node = createNode(TestGraph, NodeTestKind, obj, undefined, createGraphNodeTestRuntime);
    const runtime = getNodeRuntime(node);
    expect((runtime as NodeTestRuntime<typeof TestGraph>).testRuntimeField).toBe('testRuntimeField');
  });
});

describe('createNodeRuntime', () => {
  let runtime: NodeRuntime<typeof TestGraph>;

  beforeEach(() => {
    runtime = createNodeRuntime();
  });

  it('initializes default values', () => {
    expect(runtime.appearanceID).toStrictEqual(0);
    expect(runtime.boundsUsingLocalBoundsID).toStrictEqual(-1);
    expect(runtime.boundsUsingLocalTransformID).toStrictEqual(-1);
    expect(runtime.children).toBeNull();
    expect(runtime.nodeSignals).toBeDefined();
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
    expect(runtime.canAddChild).toStrictEqual(defaultNodeRuntimeCanAddChild);
  });

  it('does not initialize graph', () => {
    // done in createNode constructor
    expect(runtime.graph).toBeUndefined();
  });

  it('allows custom canAddChild', () => {
    const methods = {
      canAddChild: (_parent: Node<typeof TestGraph>, _child: Node<typeof TestGraph>) => true,
    };
    runtime = createNodeRuntime(methods);
    expect(runtime.canAddChild).toStrictEqual(methods.canAddChild);
  });
});

describe('createNodeSignals', () => {
  it('returns an object with all signal properties', () => {
    const signals = createNodeSignals();
    expect(signals.onChildAdded).toBeDefined();
    expect(signals.onChildRemoved).toBeDefined();
    expect(signals.onChildrenChanged).toBeDefined();
    expect(signals.onChildrenOrderChanged).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
  });
});

describe('defaultNodeRuntimeCanAddChild', () => {
  it('always returns true', () => {
    const parent = createNode(TestGraph, NodeTestKind);
    const child = createNode(TestGraph, NodeTestKind);
    expect(defaultNodeRuntimeCanAddChild(parent, child)).toBe(true);
  });
});

describe('getNodeRuntime', () => {
  it('assumes runtime is defined', () => {
    const node = { kind: NodeTestKind };
    const runtime = getNodeRuntime(node as Node<typeof TestGraph>);
    expect(runtime).toBeUndefined();
  });

  it('returns runtime when defined', () => {
    const node = createNode(TestGraph, NodeTestKind);
    const runtime = getNodeRuntime(node);
    expect(runtime).not.toBeUndefined();
  });
});

describe('getNodeSignals', () => {
  it('returns the signals object', () => {
    const node = createNode(TestGraph, NodeTestKind);
    const signals = getNodeSignals(node);
    expect(signals).toBeDefined();
    expect(signals.onChildrenChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const node = createNode(TestGraph, NodeTestKind);
    expect(getNodeSignals(node)).toBe(getNodeSignals(node));
  });
});

describe('setNodeEnabled', () => {
  it('sets enabled to false', () => {
    const node = createNode(TestGraph, NodeTestKind);
    setNodeEnabled(node, false);
    expect(node.enabled).toBe(false);
  });

  it('sets enabled back to true', () => {
    const node = createNode(TestGraph, NodeTestKind);
    setNodeEnabled(node, false);
    setNodeEnabled(node, true);
    expect(node.enabled).toBe(true);
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');

const NodeTestKind: unique symbol = Symbol('NodeTest');

interface NodeTest<Kind extends symbol> extends Node<Kind> {
  data: NodeTestData;
}

interface NodeTestData extends NodeData {
  testDataField: string;
}

interface NodeTestRuntime<Kind extends symbol> extends NodeRuntime<Kind> {
  testRuntimeField: string;
}

function createGraphNodeTestData(data?: Partial<NodeTestData>): NodeTestData {
  return {
    testDataField: data?.testDataField ?? 'testDataField',
  };
}

function createGraphNodeTestRuntime<Kind extends symbol>(): NodeTestRuntime<Kind> {
  const obj = createNodeRuntime() as NodeTestRuntime<Kind>;
  obj.testRuntimeField = 'testRuntimeField';
  return obj;
}
