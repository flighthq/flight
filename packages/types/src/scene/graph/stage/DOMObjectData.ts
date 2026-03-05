import type { PrimitiveData } from './PrimitiveData';

export default interface DOMObjectData extends PrimitiveData {
  element: HTMLElement | null;
}
