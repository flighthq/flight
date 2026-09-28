// The zero-config Spine JSON importer with every section and timeline handler linked. This is what
// a build pays when it calls parseSpineSkeleton without a selective registry.
//
// Its pair, spine-json-import-selective, registers only the bones and slots families. The difference
// between them is what a caller saves by not naming animations, skins, and timeline handlers.
import { parseSpineSkeleton } from '@flighthq/skeleton2d-formats';

export const skeleton = parseSpineSkeleton(JSON.stringify({ bones: [{ name: 'root' }] }));
