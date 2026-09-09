import { getNodeRuntime } from '@flighthq/node/contract';
import { getRegistryTableKeys } from '@flighthq/registry/contract';
import type {
  Kind,
  Material,
  NodeAny,
  RegistryTable,
  RenderState,
  Scene3DPipelineCoverageExplanation,
} from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

// Material renderers live on backend-specific registries (GlRenderRegistries, WgpuRenderRegistries),
// not on the base RenderRegistries, so the caller passes them explicitly.
export function explainScene3DPipelineCoverage(
  state: RenderState,
  scene: Readonly<NodeAny>,
  materialRenderers: Readonly<RegistryTable<unknown>> | null,
): Scene3DPipelineCoverageExplanation {
  const usedKindSet = new Set<Kind>();
  const usedMaterialKindSet = new Set<Kind>();
  collectUsed3DKinds(usedKindSet, usedMaterialKindSet, scene);

  const registeredKinds: Kind[] = [];
  getRegistryTableKeys(registeredKinds, getRenderStateRuntime(state).registries.renderers);
  registeredKinds.sort();

  const registeredMaterialKinds: Kind[] = [];
  if (materialRenderers !== null) {
    getRegistryTableKeys(registeredMaterialKinds, materialRenderers);
  }
  registeredMaterialKinds.sort();

  const usedKinds = Array.from(usedKindSet).sort();
  const usedMaterialKinds = Array.from(usedMaterialKindSet).sort();

  const registeredKindSet = new Set(registeredKinds);
  const registeredMaterialKindSet = new Set(registeredMaterialKinds);

  const uncoveredKinds: Kind[] = [];
  for (const kind of usedKinds) {
    if (!registeredKindSet.has(kind)) uncoveredKinds.push(kind);
  }

  const unusedRegistrations: Kind[] = [];
  for (const kind of registeredKinds) {
    if (!usedKindSet.has(kind)) unusedRegistrations.push(kind);
  }

  const uncoveredMaterialKinds: Kind[] = [];
  for (const kind of usedMaterialKinds) {
    if (!registeredMaterialKindSet.has(kind)) uncoveredMaterialKinds.push(kind);
  }

  const unusedMaterialRegistrations: Kind[] = [];
  for (const kind of registeredMaterialKinds) {
    if (!usedMaterialKindSet.has(kind)) unusedMaterialRegistrations.push(kind);
  }

  return {
    registeredKinds,
    registeredMaterialKinds,
    uncoveredKinds,
    uncoveredMaterialKinds,
    unusedMaterialRegistrations,
    unusedRegistrations,
    usedKinds,
    usedMaterialKinds,
  };
}

function collectUsed3DKinds(outKinds: Set<Kind>, outMaterialKinds: Set<Kind>, root: Readonly<NodeAny>): void {
  const stack: Readonly<NodeAny>[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    outKinds.add(current.kind);
    if ('materials' in current) {
      const materials = current.materials as (Material | null)[];
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i];
        outMaterialKinds.add(mat !== null ? mat.kind : StandardMaterialKind);
      }
    }
    const children = getNodeRuntime(current as NodeAny).children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }
}
