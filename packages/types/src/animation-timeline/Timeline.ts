import type { Entity } from '../../foundation';

export interface Timeline extends Entity {
  frameRate: number | null;
  scenes: object[];
  scripts: object[];
}
