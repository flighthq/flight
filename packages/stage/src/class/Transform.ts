import { DisplayObject as DisplayObjectLike } from '@flighthq/types';
import * as functions from '../functions/transform.js';

export default class Transform {
  constructor(displayObject: DisplayObjectLike) {
    functions.create(this, displayObject);
  }
}
