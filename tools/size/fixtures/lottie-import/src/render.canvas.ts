// Everything: the zero-config entry, which resolves the full layer and shape-item families. This is the control the
// four subsets are priced against, so it must stay the entry a caller reaches for when they say "read this file".
import { createScene2DFromLottieDocument } from '@flighthq/scene2d-formats';

export const result = createScene2DFromLottieDocument('{}');
