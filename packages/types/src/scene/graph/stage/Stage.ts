import type { DisplayObject } from './DisplayObject.js';
import type { StageData } from './StageData.js';

export interface Stage extends DisplayObject {
  data: StageData;
}
