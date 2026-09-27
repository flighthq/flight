import type { DragonBonesRegistry } from '@flighthq/types/contract';

import { registerDragonBonesSectionHandlers } from './dragonBonesSectionHandlers.ts';
import { registerDragonBonesTimelineHandlers } from './dragonBonesTimelineHandlers.ts';

export function registerAllDragonBonesHandlers(registry: DragonBonesRegistry): void {
  registerDragonBonesSectionHandlers(registry);
  registerDragonBonesTimelineHandlers(registry);
}
