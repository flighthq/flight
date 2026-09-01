import { getNodeChildren } from '@flighthq/node/contract';
import type {
  FlightDocumentFields,
  FlightDocumentLayoutBinding,
  FlightDocumentLayoutDescriptor,
  FlightDocumentLayoutNode,
  FlightDocumentNode,
  FlightDocumentRefusalExplanation,
  FlightDocumentValue,
  NodeAny,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import { createSceneRefusal } from './sceneDocumentRefusal';

export function checkFlightDocumentLayoutTargets(
  layouts: readonly Readonly<FlightDocumentLayoutDescriptor>[],
  root: Readonly<FlightDocumentNode>,
  sceneIndex: number,
): FlightDocumentRefusalExplanation | null {
  if (!Array.isArray(layouts)) {
    return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, 'layouts');
  }
  const targetPaths = new Map<string, string>();
  for (let layoutIndex = 0; layoutIndex < layouts.length; layoutIndex++) {
    const layout = layouts[layoutIndex];
    const layoutPath = `layouts[${layoutIndex}]`;
    if (!isRecord(layout) || !hasOnlyKeys(layout, LAYOUT_KEYS)) {
      return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, layoutPath);
    }
    const tree = layout.tree;
    if (!isRecord(tree) || !hasOnlyKeys(tree, LAYOUT_TREE_KEYS)) {
      return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, `${layoutPath}.tree`);
    }
    const nodes = tree.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, `${layoutPath}.tree.nodes`);
    }
    if (!Array.isArray(layout.targets) || layout.targets.length !== nodes.length) {
      return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, `${layoutPath}.targets`);
    }
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const nodePath = `${layoutPath}.tree.nodes[${nodeIndex}]`;
      if (!isFlightDocumentLayoutNode(nodes[nodeIndex], nodeIndex)) {
        return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, nodePath);
      }
    }
    for (let targetIndex = 0; targetIndex < layout.targets.length; targetIndex++) {
      const target = layout.targets[targetIndex];
      const targetPath = `${layoutPath}.targets[${targetIndex}]`;
      if (typeof target !== 'string' || target.length === 0 || targetPaths.has(target)) {
        return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, targetPath);
      }
      targetPaths.set(target, targetPath);
    }
  }

  const matchCounts = new Map<string, number>();
  collectAuthoredTargetMatches(root, targetPaths, matchCounts);
  for (const [target, targetPath] of targetPaths) {
    const count = matchCounts.get(target) ?? 0;
    if (count === 1) continue;
    return createSceneRefusal(
      count === 0
        ? FlightDocumentRefusalReason.LayoutTargetUnresolved
        : FlightDocumentRefusalReason.LayoutTargetAmbiguous,
      sceneIndex,
      targetPath,
    );
  }
  return null;
}

export function createFlightDocumentLayoutBindings<N extends NodeAny>(
  layouts: readonly Readonly<FlightDocumentLayoutDescriptor>[],
  root: Readonly<FlightDocumentNode>,
  materializedNodes: ReadonlyMap<Readonly<FlightDocumentNode>, N>,
): FlightDocumentLayoutBinding<N>[] | null {
  if (layouts.length === 0) return [];
  const targetNames = new Set(layouts.flatMap((layout) => layout.targets));
  const nodesByName = new Map<string, N>();
  if (!collectMaterializedNodesByName(root, targetNames, materializedNodes, nodesByName)) return null;
  return layouts.map((layout) => ({
    targets: layout.targets.map((target) => nodesByName.get(target) as N),
    tree: layout.tree,
  }));
}

export function writeFlightDocumentLayoutBindings<N extends NodeAny>(
  bindings: readonly Readonly<FlightDocumentLayoutBinding<N>>[],
  root: Readonly<N>,
  writtenNodes: ReadonlyMap<Readonly<NodeAny>, Readonly<FlightDocumentNode>>,
): FlightDocumentLayoutDescriptor[] {
  if (bindings.length === 0) return [];
  const sceneNodes = new Set<Readonly<NodeAny>>();
  const nameCounts = new Map<string, number>();
  collectLiveNodes(root, sceneNodes, nameCounts);
  const usedTargets = new Set<Readonly<NodeAny>>();
  const layouts: FlightDocumentLayoutDescriptor[] = [];
  for (const binding of bindings) {
    if (!isRecord(binding) || !hasOnlyKeys(binding, LAYOUT_KEYS)) {
      throw new RangeError('FlightDocument layout binding must contain only targets and tree');
    }
    const tree = binding.tree;
    if (!isRecord(tree) || !hasOnlyKeys(tree, LAYOUT_TREE_KEYS)) {
      throw new RangeError('FlightDocument layout binding tree must contain only nodes');
    }
    const nodes = tree.nodes;
    if (
      !Array.isArray(nodes) ||
      nodes.length === 0 ||
      !Array.isArray(binding.targets) ||
      binding.targets.length !== nodes.length
    ) {
      throw new RangeError('FlightDocument layout targets must match a non-empty tree index-for-index');
    }
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      if (!isFlightDocumentLayoutNode(nodes[nodeIndex], nodeIndex)) {
        throw new RangeError(
          'FlightDocument layout tree must use document-safe styles and parent-before-child indices',
        );
      }
    }
    const targets: string[] = [];
    for (const target of binding.targets) {
      if (!sceneNodes.has(target) || usedTargets.has(target)) {
        throw new RangeError('FlightDocument layout targets must be unique members of the written scene');
      }
      usedTargets.add(target);
      const name = target.name;
      if (name === null || name.length === 0 || nameCounts.get(name) !== 1) {
        throw new RangeError('FlightDocument layout targets require unique non-empty Node.name values');
      }
      const written = writtenNodes.get(target);
      if (written?.fields['name'] !== name) {
        throw new RangeError('FlightDocument layout target Node.name must be represented by its node schema');
      }
      targets.push(name);
    }
    layouts.push({ targets, tree: { nodes: nodes.map(cloneLayoutNode) } });
  }
  return layouts;
}

function collectAuthoredTargetMatches(
  node: Readonly<FlightDocumentNode>,
  targetPaths: ReadonlyMap<string, string>,
  counts: Map<string, number>,
): void {
  const name = node.fields['name'];
  if (typeof name === 'string' && targetPaths.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const child of node.children) collectAuthoredTargetMatches(child, targetPaths, counts);
}

function collectMaterializedNodesByName<N extends NodeAny>(
  documentNode: Readonly<FlightDocumentNode>,
  targetNames: ReadonlySet<string>,
  materializedNodes: ReadonlyMap<Readonly<FlightDocumentNode>, N>,
  out: Map<string, N>,
): boolean {
  const name = documentNode.fields['name'];
  if (typeof name === 'string' && targetNames.has(name)) {
    const materialized = materializedNodes.get(documentNode);
    if (materialized === undefined) return false;
    out.set(name, materialized);
  }
  for (const child of documentNode.children) {
    if (!collectMaterializedNodesByName(child, targetNames, materializedNodes, out)) return false;
  }
  return true;
}

function collectLiveNodes(
  node: Readonly<NodeAny>,
  nodes: Set<Readonly<NodeAny>>,
  nameCounts: Map<string, number>,
): void {
  nodes.add(node);
  if (node.name !== null) nameCounts.set(node.name, (nameCounts.get(node.name) ?? 0) + 1);
  for (const child of getNodeChildren(node)) collectLiveNodes(child, nodes, nameCounts);
}

function isFlightDocumentLayoutNode(value: unknown, index: number): value is FlightDocumentLayoutNode {
  if (!isRecord(value) || !hasOnlyKeys(value, LAYOUT_NODE_KEYS)) return false;
  const node = value as Partial<FlightDocumentLayoutNode>;
  return (
    typeof node.kind === 'string' &&
    node.kind.length > 0 &&
    typeof node.parentIndex === 'number' &&
    Number.isInteger(node.parentIndex) &&
    node.parentIndex >= -1 &&
    node.parentIndex < index &&
    isStyle(node.containerStyle) &&
    isStyle(node.itemStyle)
  );
}

function isStyle(value: unknown): value is FlightDocumentFields | null {
  return value === null || (isRecord(value) && isFlightDocumentValue(value, new Set()));
}

function isFlightDocumentValue(value: unknown, ancestors: Set<object>): value is FlightDocumentValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') {
    return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
  }
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isFlightDocumentValue(entry, ancestors))
    : Object.values(value).every((entry) => isFlightDocumentValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === null || prototype === Object.prototype;
}

function cloneLayoutNode(source: Readonly<FlightDocumentLayoutNode>): FlightDocumentLayoutNode {
  return {
    containerStyle: source.containerStyle === null ? null : cloneFields(source.containerStyle),
    itemStyle: source.itemStyle === null ? null : cloneFields(source.itemStyle),
    kind: source.kind,
    parentIndex: source.parentIndex,
  };
}

function cloneFields(source: Readonly<FlightDocumentFields>): FlightDocumentFields {
  const out: FlightDocumentFields = {};
  for (const [name, value] of Object.entries(source)) out[name] = cloneValue(value);
  return out;
}

function cloneValue(value: Readonly<FlightDocumentValue>): FlightDocumentValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  return cloneFields(value as Readonly<FlightDocumentFields>);
}

const LAYOUT_KEYS = ['targets', 'tree'];
const LAYOUT_NODE_KEYS = ['containerStyle', 'itemStyle', 'kind', 'parentIndex'];
const LAYOUT_TREE_KEYS = ['nodes'];
