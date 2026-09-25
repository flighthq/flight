import type { HostMenuCapabilities } from '@flighthq/types/contract';

import { webHostMenuHighlight, webHostMenuPopup } from './webMenu.ts';

export const webHostMenu = {
  highlight: webHostMenuHighlight,
  popup: webHostMenuPopup,
} satisfies HostMenuCapabilities;
