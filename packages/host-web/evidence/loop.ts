import { startApplicationLoop } from '@flighthq/application';
import { webLoopBackend } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = { startApplicationLoop, webLoopBackend };
