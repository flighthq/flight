import type { HostTextShaperCapabilities } from '@flighthq/types/contract';

import { webHostTextShaper as shaper } from './webTextShaper';

// Web shapes text through the Canvas 2D advances backend that used to live in its own package. The
// group was an honest empty report while there was no web implementation to point at; there is one
// now, so createWebHost ships a real shaper rather than leaving the slot unfilled.
export const webHostTextShaperGroup = { shaper } satisfies HostTextShaperCapabilities;
