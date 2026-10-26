export const ResourceResolutionState = {
  Failed: 'Failed',
  Loading: 'Loading',
  Resolved: 'Resolved',
  Unresolved: 'Unresolved',
} as const;

export type ResourceResolutionState = (typeof ResourceResolutionState)[keyof typeof ResourceResolutionState];
