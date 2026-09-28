// Everything: the zero-config entry, which resolves the full element family and the clip family. This is the control the
// subsets are priced against, so it must stay the entry a caller reaches for when they say "read this file".
import { createScene2DFromSvgDocument } from '@flighthq/scene2d-formats';

export const result = createScene2DFromSvgDocument('<svg/>');
