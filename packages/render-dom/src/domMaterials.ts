import { BlendMode } from '@flighthq/types';

export function setDOMBlendMode(element: HTMLElement, value: BlendMode | null): void {
  switch (value) {
    case BlendMode.Add:
      element.style.mixBlendMode = 'screen';
      break;
    case BlendMode.Darken:
      element.style.mixBlendMode = 'darken';
      break;
    case BlendMode.Difference:
      element.style.mixBlendMode = 'difference';
      break;
    case BlendMode.Hardlight:
      element.style.mixBlendMode = 'hard-light';
      break;
    case BlendMode.Lighten:
      element.style.mixBlendMode = 'lighten';
      break;
    case BlendMode.Multiply:
      element.style.mixBlendMode = 'multiply';
      break;
    case BlendMode.Overlay:
      element.style.mixBlendMode = 'overlay';
      break;
    case BlendMode.Screen:
      element.style.mixBlendMode = 'screen';
      break;
    default:
      element.style.mixBlendMode = '';
      break;
  }
}
