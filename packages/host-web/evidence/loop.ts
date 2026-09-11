import { startApplicationLoop } from '@flighthq/application';
import { webHostLoop } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = { startApplicationLoop, webHostLoop };
