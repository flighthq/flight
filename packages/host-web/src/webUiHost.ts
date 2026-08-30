import { createHost } from '@flighthq/entity/contract';

import { webStatusBarColorBackend } from './webStatusbar';
import { webFullscreenBackend } from './webWindow';

export const webUiHost = createHost({
  ui: {
    fullscreen: webFullscreenBackend,
    statusBarColor: webStatusBarColorBackend,
  },
});
