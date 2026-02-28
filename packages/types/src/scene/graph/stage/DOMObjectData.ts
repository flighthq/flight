import type { PrimitiveData } from './PrimitiveData';

export default interface DOMElementData extends PrimitiveData {
  element: HTMLElement | null;
}
