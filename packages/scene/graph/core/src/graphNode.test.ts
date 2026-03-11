import type { GraphNode, GraphNodeData, GraphNodeRuntime, PartialNode } from '@flighthq/types';

import {
  createGraphNode,
  createGraphNodeRuntime,
  defaultGraphNodeRuntimeCallback,
  defaultGraphNodeRuntimeCanAddChild,
  getGraphNodeRuntime,
} from './graphNode';

describe('createGraphNode', () => {
  let node: GraphNode<typeof TestGraph>;

  beforeEach(() => {
    node = createGraphNode(TestGraph, NodeTestKind);
  });

  it('initializes default values', () => {
    expect(node.visible).toBe(true);
    expect(getGraphNodeRuntime(node).graph).toStrictEqual(TestGraph);
  });

  it('allows pre-defined values', () => {
    const base = {
      parent: createGraphNode(TestGraph, NodeTestKind),
      children: [],
      visible: false,
    };
    node = createGraphNode(TestGraph, NodeTestKind, base);
    expect(node.visible).toStrictEqual(base.visible);
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
    expect(runtime.onChildrenChanged).toStrictEqual(defaultGraphNodeRuntimeCallback);
    expect(runtime.onChildrenOrderChanged).toStrictEqual(defaultGraphNodeRuntimeCallback);
    expect(runtime.onParentChanged).toStrictEqual(defaultGraphNodeRuntimeCallback);
  });

  it('does not initialize graph', () => {
    // done in createGraphNode constructor
    expect(runtime.graph).toBeUndefined();
  });

  it('allows custom methods', () => {
    const methods = {
      canAddChild: (_parent: GraphNode<typeof TestGraph>, _child: GraphNode<typeof TestGraph>) => {
        return true;
      },
      onChildrenChanged: (_target: GraphNode<typeof TestGraph>) => {},
      onChildrenOrderChanged: (_target: GraphNode<typeof TestGraph>) => {},
      onParentChanged: (_target: GraphNode<typeof TestGraph>) => {},
    };
    runtime = createGraphNodeRuntime(methods);
    expect(runtime.canAddChild).toStrictEqual(methods.canAddChild);
    expect(runtime.onChildrenChanged).toStrictEqual(methods.onChildrenChanged);
    expect(runtime.onChildrenOrderChanged).toStrictEqual(methods.onChildrenOrderChanged);
    expect(runtime.onParentChanged).toStrictEqual(methods.onParentChanged);
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
