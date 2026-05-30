import type { GraphNode, GraphNodeData, GraphNodeRuntime, PartialNode } from '@flighthq/types';

import {
  createGraphNode,
  createGraphNodeRuntime,
  createGraphNodeSignals,
  defaultGraphNodeRuntimeCanAddChild,
  getGraphNodeRuntime,
  getGraphNodeSignals,
  setEnabled,
} from './graphNode';

describe('createGraphNode', () => {
  let node: GraphNode<typeof TestGraph>;

  beforeEach(() => {
    node = createGraphNode(TestGraph, NodeTestKind);
  });

  it('initializes default values', () => {
    expect(node.enabled).toBe(true);
    expect(getGraphNodeRuntime(node).graph).toStrictEqual(TestGraph);
  });

  it('allows pre-defined values', () => {
    const base = {
      parent: createGraphNode(TestGraph, NodeTestKind),
      children: [],
      enabled: false,
    };
    node = createGraphNode(TestGraph, NodeTestKind, base);
    expect(node.enabled).toStrictEqual(base.enabled);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    node = createGraphNode(TestGraph, NodeTestKind, base);
    expect(node).not.toStrictEqual(base);
  });

  it('allows creation of a type without a data field', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    expect(node.data).toBeNull();
  });

  it('makes a default runtime object if none passed in', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    const runtime = getGraphNodeRuntime(node);
    expect(runtime).not.toBeNull();
  });

  it('allows a custom type', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    expect(node.kind).toBe(NodeTestKind);
  });

  it('returns a new object', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node: NodeTest<typeof TestGraph> = createGraphNode(TestGraph, NodeTestKind, obj) as NodeTest<
      typeof TestGraph
    >;
    expect(node).not.toStrictEqual(obj);
  });

  it('allows use of a data initializer', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node: NodeTest<typeof TestGraph> = createGraphNode(
      TestGraph,
      NodeTestKind,
      obj,
      createGraphNodeTestData,
    ) as NodeTest<typeof TestGraph>;
    expect((node.data as NodeTestData).testDataField).toBe('testDataField');
  });

  it('allows use of a runtime initializer', () => {
    const obj: PartialNode<NodeTest<typeof TestGraph>> = {};
    const node = createGraphNode(TestGraph, NodeTestKind, obj, undefined, createGraphNodeTestRuntime);
    const runtime = getGraphNodeRuntime(node);
    expect((runtime as NodeTestRuntime<typeof TestGraph>).testRuntimeField).toBe('testRuntimeField');
  });
});

describe('createGraphNodeRuntime', () => {
  let runtime: GraphNodeRuntime<typeof TestGraph>;

  beforeEach(() => {
    runtime = createGraphNodeRuntime();
  });

  it('initializes default values', () => {
    expect(runtime.appearanceID).toStrictEqual(0);
    expect(runtime.boundsUsingLocalBoundsID).toStrictEqual(-1);
    expect(runtime.boundsUsingLocalTransformID).toStrictEqual(-1);
    expect(runtime.children).toBeNull();
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
    expect(runtime.canAddChild).toStrictEqual(defaultGraphNodeRuntimeCanAddChild);
  });

  it('does not initialize graph', () => {
    // done in createGraphNode constructor
    expect(runtime.graph).toBeUndefined();
  });

  it('allows custom canAddChild', () => {
    const methods = {
      canAddChild: (_parent: GraphNode<typeof TestGraph>, _child: GraphNode<typeof TestGraph>) => true,
    };
    runtime = createGraphNodeRuntime(methods);
    expect(runtime.canAddChild).toStrictEqual(methods.canAddChild);
  });
});

describe('createGraphNodeSignals', () => {
  it('returns an object with three signal properties', () => {
    const signals = createGraphNodeSignals();
    expect(signals.onChildrenChanged).toBeDefined();
    expect(signals.onChildrenOrderChanged).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
  });
});

describe('defaultGraphNodeRuntimeCanAddChild', () => {
  it('always returns true', () => {
    const parent = createGraphNode(TestGraph, NodeTestKind);
    const child = createGraphNode(TestGraph, NodeTestKind);
    expect(defaultGraphNodeRuntimeCanAddChild(parent, child)).toBe(true);
  });
});

describe('getGraphNodeRuntime', () => {
  it('assumes runtime is defined', () => {
    const node = { kind: NodeTestKind };
    const runtime = getGraphNodeRuntime(node as GraphNode<typeof TestGraph>);
    expect(runtime).toBeUndefined();
  });

  it('returns runtime when defined', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    const runtime = getGraphNodeRuntime(node);
    expect(runtime).not.toBeUndefined();
  });
});

describe('getGraphNodeSignals', () => {
  it('returns signals object (lazily created)', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    const signals = getGraphNodeSignals(node);
    expect(signals).toBeDefined();
    expect(signals.onChildrenChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    expect(getGraphNodeSignals(node)).toBe(getGraphNodeSignals(node));
  });
});

describe('setEnabled', () => {
  it('sets enabled to false', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    setEnabled(node, false);
    expect(node.enabled).toBe(false);
  });

  it('sets enabled back to true', () => {
    const node = createGraphNode(TestGraph, NodeTestKind);
    setEnabled(node, false);
    setEnabled(node, true);
    expect(node.enabled).toBe(true);
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');

const NodeTestKind: unique symbol = Symbol('NodeTest');

interface NodeTest<GraphKind extends symbol> extends GraphNode<GraphKind> {
  data: NodeTestData;
}

interface NodeTestData extends GraphNodeData {
  testDataField: string;
}

interface NodeTestRuntime<GraphKind extends symbol> extends GraphNodeRuntime<GraphKind> {
  testRuntimeField: string;
}

function createGraphNodeTestData(data?: Partial<NodeTestData>): NodeTestData {
  return {
    testDataField: data?.testDataField ?? 'testDataField',
  };
}

function createGraphNodeTestRuntime<GraphKind extends symbol>(): NodeTestRuntime<GraphKind> {
  const obj = createGraphNodeRuntime() as NodeTestRuntime<GraphKind>;
  obj.testRuntimeField = 'testRuntimeField';
  return obj;
}
