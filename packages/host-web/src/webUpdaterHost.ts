import type { HostUpdaterCapabilities } from '@flighthq/host/contract';

// Web has no implementation for this group's slots: an empty group is the honest report, where a
// stubbed capability would be indistinguishable from a real one.
export const webHostUpdater = {} satisfies HostUpdaterCapabilities;
