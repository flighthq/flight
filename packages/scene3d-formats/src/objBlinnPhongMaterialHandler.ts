import type { ObjMaterialHandler } from '@flighthq/types/contract';
import { OBJ_MATERIAL_BLINN_PHONG_FEATURE } from '@flighthq/types/contract';

import { hasObjPbrDirectives } from './objMaterialModel.ts';
import { objMaterialToBlinnPhong } from './objParse.ts';

export const objBlinnPhongMaterialHandler: Readonly<ObjMaterialHandler> = {
  feature: OBJ_MATERIAL_BLINN_PHONG_FEATURE,
  matches(material) {
    return !hasObjPbrDirectives(material);
  },
  resolve(material, document, diagnostics) {
    return objMaterialToBlinnPhong(material, document, diagnostics);
  },
};
