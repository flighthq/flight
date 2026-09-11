import { createHost } from '@flighthq/entity/contract';
import type { HostProtocolCapabilities } from '@flighthq/types/contract';

import { webHostProtocolLaunch, webHostProtocolRegistration } from './webProtocol';

export const webHostProtocol = {
  launch: webHostProtocolLaunch,
  registration: webHostProtocolRegistration,
} satisfies HostProtocolCapabilities;

export const webProtocolHost = /* @__PURE__ */ createHost({ protocol: webHostProtocol });
