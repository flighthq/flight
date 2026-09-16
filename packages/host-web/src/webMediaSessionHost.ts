import type { HostMediaSessionCapabilities } from '@flighthq/types/contract';

import { webHostMediaSession, webHostMediaSessionAction } from './webMediasession';

export const webHostMediaSessionGroup = {
  action: webHostMediaSessionAction,
  session: webHostMediaSession,
} satisfies HostMediaSessionCapabilities;
