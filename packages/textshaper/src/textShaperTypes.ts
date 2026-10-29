import type { TextFormat } from '@flighthq/textformat/contract';

export type TextDirection = 'LeftToRight' | 'RightToLeft' | 'TopToBottom';

export const TextDirectionLeftToRight = 'LeftToRight';
export const TextDirectionRightToLeft = 'RightToLeft';
export const TextDirectionTopToBottom = 'TopToBottom';

export type TextMeasureFunction = (text: string, format: TextFormat) => number;
