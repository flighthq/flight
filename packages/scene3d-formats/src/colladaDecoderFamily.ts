import type { ColladaElementDecoder } from '@flighthq/types/contract';

import { colladaAnimationDecoder } from './colladaAnimationDecoder.ts';
import { colladaCameraDecoder } from './colladaCameraDecoder.ts';
import { colladaControllerDecoder } from './colladaControllerDecoder.ts';
import { colladaGeometryDecoder } from './colladaGeometryDecoder.ts';
import { colladaLightDecoder } from './colladaLightDecoder.ts';
import { colladaMaterialDecoder } from './colladaMaterialDecoder.ts';

/** Every decoder, in the order the single-function parser ran them. The default composition. */
export const colladaAllElementDecoders: readonly ColladaElementDecoder[] = [
  colladaMaterialDecoder,
  colladaCameraDecoder,
  colladaGeometryDecoder,
  colladaControllerDecoder,
  colladaAnimationDecoder,
  colladaLightDecoder,
];
