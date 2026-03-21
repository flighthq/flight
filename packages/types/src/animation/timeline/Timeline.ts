import type { Entity } from '../../core';

export interface Timeline extends Entity {
  frameRate: number | null;
  scenes: object[];
  scripts: object[];
}
