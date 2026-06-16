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
  let node: Node;

  beforeEach(() => {
    node = createNode(NodeTestKind);
  });

  it('initializes default values', () => {
    expect(node.enabled).toBe(true);
  });

  it('allows pre-defined values', () => {
    const base = {
      parent: createNode(NodeTestKind),
      children: [],
      enabled: false,
    };
    node = createNode(NodeTestKind, base);
    expect(node.enabled).toStrictEqual(base.enabled);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    node = createNode(NodeTestKind, base);
    expect(node).not.toStrictEqual(base);
  });

  it('allows creation of a type without a data field', () => {
    const node = createNode(NodeTestKind);
    expect(node.data).toBeNull();
  });

  it('makes a default runtime object if none passed in', () => {
    const node = createNode(NodeTestKind);
    const runtime = getNodeRuntime(node);
    expect(runtime).not.toBeNull();
  });

  it('allows a custom type', () => {
    const node = createNode(NodeTestKind);
    expect(node.kind).toBe(NodeTestKind);
  });

  it('returns a new object', () => {
    const obj: PartialNode<NodeTest> = {};
    const node: NodeTest = createNode(NodeTestKind, obj) as NodeTest;
    expect(node).not.toStrictEqual(obj);
  });

  it('allows use of a data initializer', () => {
    const obj: PartialNode<NodeTest> = {};
    const node: NodeTest = createNode(NodeTestKind, obj, createGraphNodeTestData) as NodeTest;
    expect((node.data as NodeTestData).testDataField).toBe('testDataField');
  });

  it('allows use of a runtime initializer', () => {
    const obj: PartialNode<NodeTest> = {};
    const node = createNode(NodeTestKind, obj, undefined, createGraphNodeTestRuntime);
    const runtime = getNodeRuntime(node);
    expect((runtime as NodeTestRuntime).testRuntimeField).toBe('testRuntimeField');
  });
});

describe('createNodeRuntime', () => {
  let runtime: NodeRuntime;

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

  it('does not set traits — concrete graph runtimes set it', () => {
    expect(runtime.traits).toBeUndefined();
  });

  it('allows custom canAddChild', () => {
    const methods = {
      canAddChild: (_parent: Node, _child: Node) => true,
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
    const parent = createNode(NodeTestKind);
    const child = createNode(NodeTestKind);
    expect(defaultNodeRuntimeCanAddChild(parent, child)).toBe(true);
  });
});

describe('getNodeRuntime', () => {
  it('assumes runtime is defined', () => {
    const node = { kind: NodeTestKind };
    const runtime = getNodeRuntime(node as Node);
    expect(runtime).toBeUndefined();
  });

  it('returns runtime when defined', () => {
    const node = createNode(NodeTestKind);
    const runtime = getNodeRuntime(node);
    expect(runtime).not.toBeUndefined();
  });
});

describe('getNodeSignals', () => {
  it('returns the signals object', () => {
    const node = createNode(NodeTestKind);
    const signals = getNodeSignals(node);
    expect(signals).toBeDefined();
    expect(signals.onChildrenChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const node = createNode(NodeTestKind);
    expect(getNodeSignals(node)).toBe(getNodeSignals(node));
  });
});

describe('setNodeEnabled', () => {
  it('sets enabled to false', () => {
    const node = createNode(NodeTestKind);
    setNodeEnabled(node, false);
    expect(node.enabled).toBe(false);
  });

  it('sets enabled back to true', () => {
    const node = createNode(NodeTestKind);
    setNodeEnabled(node, false);
    setNodeEnabled(node, true);
    expect(node.enabled).toBe(true);
  });
});

const NodeTestKind: unique symbol = Symbol('NodeTest');

interface NodeTest extends Node {
  data: NodeTestData;
}

interface NodeTestData extends NodeData {
  testDataField: string;
}

interface NodeTestRuntime extends NodeRuntime {
  testRuntimeField: string;
}

function createGraphNodeTestData(data?: Partial<NodeTestData>): NodeTestData {
  return {
    testDataField: data?.testDataField ?? 'testDataField',
  };
}

function createGraphNodeTestRuntime(): NodeTestRuntime {
  const obj = createNodeRuntime() as NodeTestRuntime;
  obj.testRuntimeField = 'testRuntimeField';
  return obj;
}
