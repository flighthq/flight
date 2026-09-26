import type { ObjMaterialHandler } from '@flighthq/types/contract';
import { OBJ_MATERIAL_STANDARD_PBR_FEATURE } from '@flighthq/types/contract';

import { hasObjPbrDirectives } from './objMaterialModel.ts';
import { objMaterialToStandardPbr } from './objParse.ts';

export const objStandardPbrMaterialHandler: Readonly<ObjMaterialHandler> = {
  feature: OBJ_MATERIAL_STANDARD_PBR_FEATURE,
  matches(material) {
    return hasObjPbrDirectives(material);
  },
  resolve(material, document, diagnostics) {
    return objMaterialToStandardPbr(material, document, diagnostics);
  },
};
