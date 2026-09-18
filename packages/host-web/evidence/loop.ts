import { startAppLoop } from '@flighthq/app';
import { webHostLoop } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = { startAppLoop, webHostLoop };
