import type { Node, NodeData, PartialNode, Runtime } from '@flighthq/types';
import { NodeKind } from '@flighthq/types';

import { createNode } from './node';
import { createRuntime, getRuntime } from './runtime';

describe('createNode', () => {
  let node: Node;

  beforeEach(() => {
    node = createNode(NodeTestKind);
  });

  it('initializes default values', () => {
    expect(node.data).toBeNull();
    expect(node.kind).toBe(NodeTestKind);
    expect(node.name).toBeNull();
  });

  it('allows pre-defined values', () => {
    const base = {
      name: 'hello',
    };
    node = createNode(NodeTestKind, base);
    expect(node.name).toStrictEqual(base.name);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    node = createNode(NodeTestKind, base);
    expect(node).not.toStrictEqual(base);
  });

  it('allows creation of a type without a data field', () => {
    const node = createNode(NodeKind);
    expect(node.data).toBeNull();
  });

  it('makes a default runtime object if none passed in', () => {
    const node = createNode(NodeKind);
    const runtime = getRuntime(node);
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
    const node: NodeTest = createNode(NodeTestKind, obj, createNodeTestData) as NodeTest;
    expect((node.data as NodeTestData).testDataField).toBe('testDataField');
  });

  it('allows use of a runtime initializer', () => {
    const obj: PartialNode<NodeTest> = {};
    const node = createNode(NodeTestKind, obj, undefined, createNodeTestRuntime);
    const runtime = getRuntime(node);
    expect((runtime as NodeTestRuntime).testRuntimeField).toBe('testRuntimeField');
  });
});

const NodeTestKind: unique symbol = Symbol('NodeTest');

interface NodeTest extends Node {
  data: NodeTestData;
}

interface NodeTestData extends NodeData {
  testDataField: string;
}

interface NodeTestRuntime extends Runtime {
  testRuntimeField: string;
}

function createNodeTestData(data?: Partial<NodeTestData>): NodeTestData {
  return {
    testDataField: data?.testDataField ?? 'testDataField',
  };
}

function createNodeTestRuntime(): NodeTestRuntime {
  const obj = createRuntime() as NodeTestRuntime;
  obj.testRuntimeField = 'testRuntimeField';
  return obj;
}
