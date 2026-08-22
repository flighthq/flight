import { startApplicationLoop } from '@flighthq/application';
import { enableHostWebLoop } from '@flighthq/host-web';

enableHostWebLoop();
(globalThis as Record<string, unknown>).__evidence = startApplicationLoop;
