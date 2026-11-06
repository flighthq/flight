import type { HostVideoCapabilities } from '@flighthq/video/contract';

import { webHostVideo } from './webVideoCapability.ts';

export const webHostVideoGroup = {
  playback: webHostVideo,
} satisfies HostVideoCapabilities;
