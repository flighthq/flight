import { getNodeRuntime } from '@flighthq/node/contract';
import { getRegistryTableKeys } from '@flighthq/registry/contract';
import type { Kind, NodeAny, RenderState, Scene2DPipelineCoverageExplanation } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

export function explainScene2DPipelineCoverage(
  state: RenderState,
  scene: Readonly<NodeAny>,
): Scene2DPipelineCoverageExplanation {
  const usedSet = new Set<Kind>();
  collectUsedKinds(usedSet, scene);

  const registeredKinds: Kind[] = [];
  getRegistryTableKeys(registeredKinds, getRenderStateRuntime(state).registries.renderers);
  registeredKinds.sort();

  const usedKinds = Array.from(usedSet).sort();
  const registeredSet = new Set(registeredKinds);

  const uncoveredKinds: Kind[] = [];
  for (const kind of usedKinds) {
    if (!registeredSet.has(kind)) uncoveredKinds.push(kind);
  }

  const unusedRegistrations: Kind[] = [];
  for (const kind of registeredKinds) {
    if (!usedSet.has(kind)) unusedRegistrations.push(kind);
  }

  return { registeredKinds, uncoveredKinds, unusedRegistrations, usedKinds };
}

function collectUsedKinds(out: Set<Kind>, root: Readonly<NodeAny>): void {
  const stack: Readonly<NodeAny>[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    out.add(current.kind);
    const children = getNodeRuntime(current as NodeAny).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }
}
