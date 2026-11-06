import type { HostMediaSessionCapabilities } from '@flighthq/mediasession/contract';

import { webHostMediaSession, webHostMediaSessionAction } from './webMediasession.ts';

export const webHostMediaSessionGroup = {
  action: webHostMediaSessionAction,
  control: webHostMediaSession,
} satisfies HostMediaSessionCapabilities;
