import type { ObjMaterialHandler } from '@flighthq/types/contract';

import { hasObjPbrDirectives, objMaterialToStandardPbr } from './objParse.ts';

export const objStandardPbrMaterialHandler: Readonly<ObjMaterialHandler> = {
  matches(material) {
    return hasObjPbrDirectives(material);
  },
  resolve(material, document, diagnostics) {
    return objMaterialToStandardPbr(material, document, diagnostics);
  },
};
