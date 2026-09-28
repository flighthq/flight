// Everything: the zero-config entry, which installs every family in pass order. This is the control the subsets are
// priced against, so it must stay the entry a caller reaches for when they say "read this file".
import { createMartinezPathBooleanKernel } from '@flighthq/path-boolean';
import { createScene2DFromRiveDocument } from '@flighthq/scene2d-formats';

export const result = createScene2DFromRiveDocument(createMartinezPathBooleanKernel(), new Uint8Array());
