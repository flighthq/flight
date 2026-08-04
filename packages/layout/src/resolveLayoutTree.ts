import type {
  LayoutResolutionExplanation,
  LayoutResolutionFailureKind,
  LayoutState,
  LayoutTree,
} from '@flighthq/types/contract';
import { LayoutResolutionFailureKind as Failure } from '@flighthq/types/contract';

// Returns a detached explanation for the latest matching sentinel, or diagnoses hierarchy/registration at
// `nodeIndex` without mutating state. Expectedly valid nodes return null.
export function explainLayoutResolution(
  state: Readonly<LayoutState>,
  tree: Readonly<LayoutTree>,
  nodeIndex: number,
): LayoutResolutionExplanation | null {
  if (
    state.lastFailureKind !== null &&
    (nodeIndex < 0 || state.lastFailureNodeIndex < 0 || nodeIndex === state.lastFailureNodeIndex)
  ) {
    return {
      actualLength: state.lastFailureActualLength,
      kind: state.lastFailureKind,
      nodeIndex: state.lastFailureNodeIndex,
      parentIndex: state.lastFailureParentIndex,
      requiredLength: state.lastFailureRequiredLength,
      resolverKind: state.lastFailureResolverKind,
    };
  }

  const nodes = tree.nodes;
  if (nodeIndex < 0 || nodeIndex >= nodes.length) return null;
  const node = nodes[nodeIndex];
  if (node.parentIndex < -1 || node.parentIndex >= nodeIndex) {
    return explanation(Failure.InvalidHierarchy, nodeIndex, node.parentIndex, node.kind);
  }
  for (let i = nodeIndex + 1; i < nodes.length; i++) {
    if (nodes[i].parentIndex === nodeIndex && !state.resolvers.has(node.kind)) {
      return explanation(Failure.UnregisteredKind, nodeIndex, -1, node.kind);
    }
  }
  return null;
}

// Resolves a flat, parent-before-child tree into absolute rectangles. `intrinsicSizes` is two floats per
// node (natural width, height); `out` is four floats per node (x, y, width, height). Both buffers belong to
// the caller. The successful path performs no allocation, and an anchor-only tree is one forward pass.
export function resolveLayoutTree(
  out: Float32Array,
  state: LayoutState,
  tree: Readonly<LayoutTree>,
  intrinsicSizes: ArrayLike<number>,
  availableWidth: number,
  availableHeight: number,
): boolean {
  clearLayoutFailure(state);
  const nodes = tree.nodes;
  const requiredOutLength = nodes.length * 4;
  if (out.length < requiredOutLength) {
    return failLayoutResolution(state, tree, Failure.OutputTooSmall, -1, -1, requiredOutLength, out.length, null);
  }
  const requiredIntrinsicLength = nodes.length * 2;
  if (intrinsicSizes.length < requiredIntrinsicLength) {
    return failLayoutResolution(
      state,
      tree,
      Failure.IntrinsicSizesTooSmall,
      -1,
      -1,
      requiredIntrinsicLength,
      intrinsicSizes.length,
      null,
    );
  }

  const rootWidth = finiteSize(availableWidth);
  const rootHeight = finiteSize(availableHeight);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const parentIndex = node.parentIndex;
    if (parentIndex < -1 || parentIndex >= i) {
      return failLayoutResolution(state, tree, Failure.InvalidHierarchy, i, parentIndex, 0, 0, node.kind);
    }
    const offset = i * 4;
    if (parentIndex === -1) {
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = rootWidth;
      out[offset + 3] = rootHeight;
      continue;
    }

    const parentKind = nodes[parentIndex].kind;
    const resolver = state.resolvers.get(parentKind);
    if (resolver === undefined) {
      return failLayoutResolution(state, tree, Failure.UnregisteredKind, parentIndex, -1, 0, 0, parentKind);
    }
    const failure = resolver(out, tree, intrinsicSizes, parentIndex, i);
    if (failure !== null) {
      const failureNodeIndex = failure === Failure.InvalidContainerStyle ? parentIndex : i;
      return failLayoutResolution(state, tree, failure, failureNodeIndex, parentIndex, 0, 0, parentKind);
    }
  }
  return true;
}

function explanation(
  kind: LayoutResolutionFailureKind,
  nodeIndex: number,
  parentIndex: number,
  resolverKind: string | null,
): LayoutResolutionExplanation {
  return { actualLength: 0, kind, nodeIndex, parentIndex, requiredLength: 0, resolverKind };
}

function clearLayoutFailure(state: LayoutState): void {
  state.lastFailureActualLength = 0;
  state.lastFailureKind = null;
  state.lastFailureNodeIndex = -1;
  state.lastFailureParentIndex = -1;
  state.lastFailureRequiredLength = 0;
  state.lastFailureResolverKind = null;
}

function failLayoutResolution(
  state: LayoutState,
  tree: Readonly<LayoutTree>,
  kind: LayoutResolutionFailureKind,
  nodeIndex: number,
  parentIndex: number,
  requiredLength: number,
  actualLength: number,
  resolverKind: string | null,
): false {
  state.lastFailureActualLength = actualLength;
  state.lastFailureKind = kind;
  state.lastFailureNodeIndex = nodeIndex;
  state.lastFailureParentIndex = parentIndex;
  state.lastFailureRequiredLength = requiredLength;
  state.lastFailureResolverKind = resolverKind;
  if (state.guard !== null) state.guard(explainLayoutResolution(state, tree, nodeIndex) as LayoutResolutionExplanation);
  return false;
}

function finiteSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
