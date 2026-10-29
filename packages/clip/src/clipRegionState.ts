import { createClipRegionState } from './clipRegionRuntime.ts';

let clipRegionStateBinding: ReturnType<typeof createClipRegionState> | undefined;

export function getClipRegionStateBinding(): ReturnType<typeof createClipRegionState> {
  if (clipRegionStateBinding === undefined) clipRegionStateBinding = createClipRegionState();
  return clipRegionStateBinding;
}
