import type { HostMenuCapabilities } from '@flighthq/types/contract';

import { webHostMenuHighlight, webHostMenuPopup } from './webMenu';

export const webHostMenu = {
  highlight: webHostMenuHighlight,
  popup: webHostMenuPopup,
} satisfies HostMenuCapabilities;
