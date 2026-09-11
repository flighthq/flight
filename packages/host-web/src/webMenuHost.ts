import { createHost } from '@flighthq/entity/contract';
import type { HostMenuCapabilities } from '@flighthq/types/contract';

import { webHostMenuHighlight, webHostMenuPopup } from './webMenu';

export const webHostMenu = {
  highlight: webHostMenuHighlight,
  popup: webHostMenuPopup,
} satisfies HostMenuCapabilities;

export const webMenuHost = /* @__PURE__ */ createHost({ menu: webHostMenu });
