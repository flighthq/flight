import type { ObjMaterialHandler } from '@flighthq/types/contract';

import { hasObjPbrDirectives, objMaterialToBlinnPhong } from './objParse.ts';

export const objBlinnPhongMaterialHandler: Readonly<ObjMaterialHandler> = {
  matches(material) {
    return !hasObjPbrDirectives(material);
  },
  resolve(material, document, diagnostics) {
    return objMaterialToBlinnPhong(material, document, diagnostics);
  },
};
