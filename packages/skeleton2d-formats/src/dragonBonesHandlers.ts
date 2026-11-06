import type { DragonBonesRegistry } from './contract.skeleton2d-formats-types.ts';
import { registerDragonBonesSectionHandlers } from './dragonBonesSectionHandlers.ts';
import { registerDragonBonesTimelineHandlers } from './dragonBonesTimelineHandlers.ts';

export function registerAllDragonBonesHandlers(registry: DragonBonesRegistry): void {
  registerDragonBonesSectionHandlers(registry);
  registerDragonBonesTimelineHandlers(registry);
}
