import { emitSignal } from '@flighthq/signals';

import { getWorldNodeRuntime, invalidateParentReference, type WorldNode } from './worldNode';

export function addWorldChild(target: WorldNode, child: WorldNode): WorldNode {
  return addWorldChildAt(target, child, getWorldNumChildren(target));
}

export function addWorldChildAt(target: WorldNode, child: WorldNode, index: number): WorldNode {
  const targetRuntime = getWorldNodeRuntime(target);
  let children = targetRuntime.children;

  if (!child) {
    throw new TypeError('Parameter child must be non-null');
  } else if (child === target) {
    throw new TypeError('An object cannot be added as a child of itself');
  } else if (index < 0 || (children !== null && index > children.length) || (children === null && index > 0)) {
    throw new RangeError('The supplied index is out of bounds.');
  }

  if (children === null) {
    children = targetRuntime.children = [];
  }

  const childRuntime = getWorldNodeRuntime(child);
  const parent = childRuntime.parent;

  if (parent === target) {
    const i = children.indexOf(child);
    if (i !== -1) {
      if (i === index) return child;
      children.splice(i, 1);
    }
  } else {
    if (parent !== null) {
      removeWorldChild(parent, child);
    }
  }

  children.splice(index, 0, child);
  emitSignal(targetRuntime.worldNodeSignals.onChildrenChanged);

  if (parent !== target) {
    childRuntime.parent = target;
    emitSignal(targetRuntime.worldNodeSignals.onChildAdded, child);
    emitSignal(childRuntime.worldNodeSignals.onParentChanged);
    invalidateParentReference(child);
  }

  return child;
}

export function containsWorldChild(source: Readonly<WorldNode>, child: Readonly<WorldNode>): boolean {
  let current: WorldNode | null = child;
  while (current !== source && current !== null) {
    current = getWorldParent(current);
  }
  return current === source;
}

export function getWorldChildAt(source: Readonly<WorldNode>, index: number): WorldNode | null {
  const children = getWorldNodeRuntime(source).children;
  if (children !== null && index >= 0 && index < children.length) {
    return children[index];
  }
  return null;
}

export function getWorldChildByName(source: Readonly<WorldNode>, name: string): WorldNode | null {
  const children = getWorldNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if (children[i].name === name) return children[i];
    }
  }
  return null;
}

export function getWorldChildIndex(source: Readonly<WorldNode>, child: Readonly<WorldNode>): number {
  const children = getWorldNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if (children[i] === child) return i;
    }
  }
  return -1;
}

export function getWorldNumChildren(source: Readonly<WorldNode>): number {
  const children = getWorldNodeRuntime(source).children;
  return children !== null ? children.length : 0;
}

export function getWorldParent(source: Readonly<WorldNode>): WorldNode | null {
  return getWorldNodeRuntime(source).parent;
}

export function getWorldRoot(source: WorldNode): WorldNode {
  let current: WorldNode = source;
  let parent = getWorldParent(current);
  while (parent !== null) {
    current = parent;
    parent = getWorldParent(current);
  }
  return current;
}

export function removeWorldChild(target: WorldNode, child: WorldNode): WorldNode {
  if (!child) return child;
  const targetRuntime = getWorldNodeRuntime(target);
  const childRuntime = getWorldNodeRuntime(child);
  const children = targetRuntime.children;
  if (children !== null && childRuntime.parent === target) {
    childRuntime.parent = null;
    emitSignal(childRuntime.worldNodeSignals.onParentChanged);
    invalidateParentReference(child);
    const i = children.indexOf(child);
    if (i !== -1) {
      children.splice(i, 1);
    }
    emitSignal(targetRuntime.worldNodeSignals.onChildRemoved, child);
    emitSignal(targetRuntime.worldNodeSignals.onChildrenChanged);
  }
  return child;
}

export function removeWorldChildAt(target: WorldNode, index: number): WorldNode | null {
  const children = getWorldNodeRuntime(target).children;
  if (children !== null && index >= 0 && index < children.length) {
    return removeWorldChild(target, children[index]);
  }
  return null;
}

export function removeWorldChildren(target: WorldNode, beginIndex: number = 0, endIndex?: number): void {
  const children = getWorldNodeRuntime(target).children;
  if (children === null) return;
  if (beginIndex > children.length - 1) return;

  if (endIndex === undefined) {
    endIndex = children.length - 1;
  }

  if (endIndex < beginIndex || beginIndex < 0 || endIndex > children.length) {
    throw new RangeError('The supplied index is out of bounds.');
  }

  let numRemovals = endIndex - beginIndex;
  while (numRemovals >= 0) {
    removeWorldChildAt(target, beginIndex);
    numRemovals--;
  }
}

export function setWorldChildIndex(target: WorldNode, child: WorldNode, index: number): void {
  const targetRuntime = getWorldNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null) return;
  if (index >= 0 && index <= children.length && getWorldParent(child) === target) {
    const i = children.indexOf(child);
    if (i !== -1 && i !== index) {
      children.splice(i, 1);
      children.splice(index, 0, child);
      emitSignal(targetRuntime.worldNodeSignals.onChildrenOrderChanged);
    }
  }
}

export function swapWorldChildren(target: WorldNode, child1: WorldNode, child2: WorldNode): void {
  const targetRuntime = getWorldNodeRuntime(target);
  const children = targetRuntime.children;
  if (children !== null && getWorldParent(child1) === target && getWorldParent(child2) === target) {
    const index1 = children.indexOf(child1);
    const index2 = children.indexOf(child2);
    children[index1] = child2;
    children[index2] = child1;
    emitSignal(targetRuntime.worldNodeSignals.onChildrenOrderChanged);
  }
}

export function swapWorldChildrenAt(target: WorldNode, index1: number, index2: number): void {
  const targetRuntime = getWorldNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null || index1 === index2) return;
  const len = children.length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throw new RangeError('The supplied index is out of bounds.');
  }
  const swap = children[index1];
  children[index1] = children[index2];
  children[index2] = swap;
  emitSignal(targetRuntime.worldNodeSignals.onChildrenOrderChanged);
}
