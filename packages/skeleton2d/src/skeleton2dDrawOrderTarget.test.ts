import { createAnimationChannel, createAnimationTrack } from '@flighthq/animation/contract';
import {
  addNodeChild,
  applyNodeOrderList,
  createNode,
  createNodeOrderList,
  getNodeChildAt,
} from '@flighthq/node/contract';
import type { AnimationChannel, AnimationInterpolation, Node, NodeOrderList } from '@flighthq/types/contract';

import { getSkeleton2DAnimationTargetBinder } from './skeleton2dAnimationTarget';
import {
  createSkeleton2DDrawOrderAnimationTarget,
  createSkeleton2DDrawOrderChannel,
  initializeSkeleton2DDrawOrderAnimationTarget,
  registerSkeleton2DDrawOrderAnimationBinder,
  unregisterSkeleton2DDrawOrderAnimationBinder,
} from './skeleton2dDrawOrderTarget';
import { setSkeleton2DCoercedInterpolationGuard } from './skeleton2dGuards';

afterEach(() => {
  unregisterSkeleton2DDrawOrderAnimationBinder();
  setSkeleton2DCoercedInterpolationGuard(null);
});

describe('createSkeleton2DDrawOrderAnimationTarget', () => {
  it('stamps the kind the binder dispatches on', () => {
    // A literal omitting kind binds to nothing, which is why the constructor exists.
    const target = createSkeleton2DDrawOrderAnimationTarget([], createNodeOrderList());

    expect(target.kind).toBe('Skeleton2D.DrawOrderTarget');
  });
});

describe('createSkeleton2DDrawOrderChannel', () => {
  it('builds a step track whose components are the slot count', () => {
    // slotCount is derived as orderings.length / times.length rather than stored, so the two cannot
    // disagree.
    const { list, nodes } = rig(3);
    const channel = createSkeleton2DDrawOrderChannel({ orderings: [0, 1, 2, 2, 0, 1], times: [0, 1] }, nodes, list)!;

    expect(channel.track.components).toBe(3);
    expect(channel.track.interpolation).toBe('Step');
  });

  it('builds the track as Step so the coercion guard has nothing to report', () => {
    // The honest shape does not need the warning — an ordering track authored as Step is not coerced.
    const seen: string[] = [];
    setSkeleton2DCoercedInterpolationGuard((report) => void seen.push(report.subject));
    const { list, nodes } = rig(2);
    const channel = createSkeleton2DDrawOrderChannel({ orderings: [0, 1, 1, 0], times: [0, 1] }, nodes, list)!;

    registerSkeleton2DDrawOrderAnimationBinder();
    getSkeleton2DAnimationTargetBinder('Skeleton2D.DrawOrderTarget')!(
      channel,
      null as never,
      null as never,
      channel.targetRef,
      1,
    );

    expect(seen).toEqual([]);
    expect(list.sortKeys.slice(0, 2)).toEqual([1, 0]);
  });

  it('stamps the target so the channel binds without further wiring', () => {
    const { list, nodes } = rig(2);
    const channel = createSkeleton2DDrawOrderChannel({ orderings: [0, 1], times: [0] }, nodes, list)!;

    expect((channel.targetRef as { kind: string }).kind).toBe('Skeleton2D.DrawOrderTarget');
  });

  it('returns null for a timeline with no keyframes', () => {
    const { list, nodes } = rig(2);

    expect(createSkeleton2DDrawOrderChannel({ orderings: [], times: [] }, nodes, list)).toBeNull();
  });

  it('returns null when the orderings are not a whole number of per-keyframe orderings', () => {
    // A partial final ordering would silently drop the slots past its end rather than fail.
    const { list, nodes } = rig(2);

    expect(createSkeleton2DDrawOrderChannel({ orderings: [0, 1, 1], times: [0, 1] }, nodes, list)).toBeNull();
  });
});

describe('initializeSkeleton2DDrawOrderAnimationTarget', () => {
  it('is the construction initializer of createSkeleton2DDrawOrderAnimationTarget', () => {
    expect(typeof initializeSkeleton2DDrawOrderAnimationTarget).toBe('function');
  });
});

describe('registerSkeleton2DDrawOrderAnimationBinder', () => {
  it('claims nothing until called, so an unused family shakes out', () => {
    // Bone and slot bind without registration because posing a rig IS the package; draw order is the
    // part the registry buys — a rig that never reorders pays for neither this nor its node edge.
    expect(getSkeleton2DAnimationTargetBinder('Skeleton2D.DrawOrderTarget')).toBeNull();
  });

  it('claims the draw-order kind once called', () => {
    registerSkeleton2DDrawOrderAnimationBinder();

    expect(getSkeleton2DAnimationTargetBinder('Skeleton2D.DrawOrderTarget')).not.toBeNull();
  });

  it('writes the ordering the keyframe states into the caller list', () => {
    const { list, nodes } = rig(3);
    // Frame 0 draws them in order; frame 1 puts the last one first.
    bind(nodes, list, [0, 1], [0, 1, 2, 2, 0, 1], 3, 'Step', 1);

    expect(list.entryCount).toBe(3);
    expect(list.sortKeys.slice(0, 3)).toEqual([2, 0, 1]);
  });

  it('holds the first keyframe before the track starts rather than binding nothing', () => {
    const { list, nodes } = rig(2);
    bind(nodes, list, [5, 9], [0, 1, 1, 0], 2, 'Step', 0);

    expect(list.sortKeys.slice(0, 2)).toEqual([0, 1]);
  });

  it('steps rather than blending between two orderings', () => {
    const { list, nodes } = rig(2);
    // Halfway between [0,1] and [1,0]. Blending would give 0.5 and 0.5 — sort keys nobody authored.
    bind(nodes, list, [0, 1], [0, 1, 1, 0], 2, 'Step', 0.5);

    expect(list.sortKeys.slice(0, 2)).toEqual([0, 1]);
  });

  it('reports the coercion when the track claims it can be interpolated', () => {
    const seen: string[] = [];
    setSkeleton2DCoercedInterpolationGuard((report) => void seen.push(`${report.subject}:${report.stated}`));
    const { list, nodes } = rig(2);

    bind(nodes, list, [0, 1], [0, 1, 1, 0], 2, 'Linear', 1);

    // Correct to force the step, and it must not be invisible.
    expect(seen).toEqual(['DrawOrder:Linear']);
    expect(list.sortKeys.slice(0, 2)).toEqual([1, 0]);
  });

  it('says nothing when the track already states steps', () => {
    const seen: string[] = [];
    setSkeleton2DCoercedInterpolationGuard((report) => void seen.push(report.subject));
    const { list, nodes } = rig(2);

    bind(nodes, list, [0, 1], [0, 1, 1, 0], 2, 'Step', 1);

    expect(seen).toEqual([]);
  });

  // The count is min(components, nodes.length) and only the nodes-are-fewer side was reachable from the
  // tests above. This is the other side: a clip authored against a rig with fewer slots than the one it is
  // played on. The extra nodes get no entry at all, which is the right answer rather than an oversight —
  // an ordering that never mentions a node has no opinion about where it goes, and `applyNodeOrderList`
  // leaves anything absent from the list where it already was.
  it('orders only the slots the track states, leaving later nodes out of the list entirely', () => {
    const { list, nodes, parent } = rig(3);

    bind(nodes, list, [0], [1, 0], 2, 'Step', 0);

    expect(list.entryCount).toBe(2);
    expect(list.nodes[0]).toBe(nodes[0]);
    expect(list.nodes[1]).toBe(nodes[1]);

    applyNodeOrderList(parent, list);

    // The two stated slots swapped; the third node was never named and kept its place at the end.
    expect(getNodeChildAt(parent, 0)).toBe(nodes[1]);
    expect(getNodeChildAt(parent, 1)).toBe(nodes[0]);
    expect(getNodeChildAt(parent, 2)).toBe(nodes[2]);
  });

  it('skips a slot that draws nothing rather than entering a placeholder', () => {
    const list = createNodeOrderList();
    const parent = createNode(TEST_NODE_KIND);
    const drawn = createNode(TEST_NODE_KIND);
    addNodeChild(parent, drawn);
    // Slot 0 draws nothing, slot 1 draws `drawn`.
    bind([null, drawn], list, [0], [1, 0], 2, 'Step', 0);

    expect(list.entryCount).toBe(1);
    expect(list.nodes[0]).toBe(drawn);
  });

  it('permutes the parent children once the caller applies the list', () => {
    // The binder fills the list; applying it stays the caller's explicit step.
    const { list, nodes, parent } = rig(3);
    bind(nodes, list, [0], [2, 0, 1], 3, 'Step', 0);
    applyNodeOrderList(parent, list);

    expect(getNodeChildAt(parent, 0)).toBe(nodes[1]);
    expect(getNodeChildAt(parent, 1)).toBe(nodes[2]);
    expect(getNodeChildAt(parent, 2)).toBe(nodes[0]);
  });
});

function rig(count: number): { list: NodeOrderList; nodes: Node[]; parent: Node } {
  const parent = createNode(TEST_NODE_KIND);
  const nodes = Array.from({ length: count }, () => createNode(TEST_NODE_KIND));
  for (const node of nodes) addNodeChild(parent, node);
  return { list: createNodeOrderList(), nodes, parent };
}

function bind(
  nodes: readonly (Node | null)[],
  list: NodeOrderList,
  times: number[],
  values: number[],
  components: number,
  interpolation: AnimationInterpolation,
  time: number,
): void {
  registerSkeleton2DDrawOrderAnimationBinder();
  const binder = getSkeleton2DAnimationTargetBinder('Skeleton2D.DrawOrderTarget')!;
  binder(track(times, values, components, interpolation), null as never, null as never, target(nodes, list), time);
}

function target(nodes: readonly (Node | null)[], list: NodeOrderList) {
  return createSkeleton2DDrawOrderAnimationTarget(nodes, list);
}

function track(
  times: number[],
  values: number[],
  components: number,
  interpolation: AnimationInterpolation,
): AnimationChannel {
  return createAnimationChannel(createAnimationTrack({ components, interpolation, times, values }), null);
}

// Ordering is kind-agnostic — it permutes children, whatever they draw.
const TEST_NODE_KIND = 'Skeleton2DDrawOrderTestNode';
describe('unregisterSkeleton2DDrawOrderAnimationBinder', () => {
  it('releases the kind again', () => {
    registerSkeleton2DDrawOrderAnimationBinder();
    unregisterSkeleton2DDrawOrderAnimationBinder();

    expect(getSkeleton2DAnimationTargetBinder('Skeleton2D.DrawOrderTarget')).toBeNull();
  });
});
