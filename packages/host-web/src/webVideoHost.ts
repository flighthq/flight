import type { HostVideoCapabilities } from '@flighthq/types/contract';

import { webHostVideo } from './webVideoCapability.ts';

export const webHostVideoGroup = {
  playback: webHostVideo,
} satisfies HostVideoCapabilities;
