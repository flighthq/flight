import type { PrimitiveData } from './PrimitiveData';

export interface DOMObjectData extends PrimitiveData {
  element: HTMLElement | null;
}
