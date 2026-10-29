import type { HostMenuCapabilities } from '@flighthq/menu/contract';

import { webHostMenuHighlight, webHostMenuPopup } from './webMenu.ts';

export const webHostMenu = {
  highlight: webHostMenuHighlight,
  popup: webHostMenuPopup,
} satisfies HostMenuCapabilities;
