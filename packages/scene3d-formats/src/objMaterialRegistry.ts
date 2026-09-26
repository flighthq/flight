import type { ObjMaterialHandler } from '@flighthq/types/contract';

import { objBlinnPhongMaterialHandler } from './objBlinnPhongMaterialHandler.ts';
import { objStandardPbrMaterialHandler } from './objStandardPbrMaterialHandler.ts';

export const objBlinnPhongMaterialFamily: readonly ObjMaterialHandler[] = [objBlinnPhongMaterialHandler];

export const objStandardPbrMaterialFamily: readonly ObjMaterialHandler[] = [objStandardPbrMaterialHandler];

/**
 * Every material handler Flight reads an OBJ/MTL file with — the full-support preset, which
 * reproduces the monolithic importer's complete material dispatch. A caller who knows their files
 * never use PBR extensions names `objBlinnPhongMaterialFamily` and the StandardPbr handler — and
 * the parsing, material packages, and render paths behind it — never link.
 */
export const objAllMaterialHandlers: readonly ObjMaterialHandler[] = [
  ...objBlinnPhongMaterialFamily,
  ...objStandardPbrMaterialFamily,
];
