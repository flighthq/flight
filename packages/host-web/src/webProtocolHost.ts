import type { HostProtocolCapabilities } from '@flighthq/host/contract';

import { webHostProtocolLaunch, webHostProtocolRegistration } from './webProtocol.ts';

export const webHostProtocol = {
  launch: webHostProtocolLaunch,
  registration: webHostProtocolRegistration,
} satisfies HostProtocolCapabilities;
