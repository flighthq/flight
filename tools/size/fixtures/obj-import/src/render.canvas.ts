// The OBJ importer with every material handler — what a build pays when it asks for both Blinn-Phong
// and StandardPbr material models.
//
// Its pair, obj-import-selective, names only the Blinn-Phong handler. The difference between them is
// what a caller saves by not naming the PBR handler, and it is the number that says whether the
// material-handler boundary is load-bearing or decorative.
import { parseObj } from '@flighthq/scene3d-formats';

export const document = parseObj('');
