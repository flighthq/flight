export interface ReferenceImageRequestLabel {
  cellCount: number;
  entryLabel: string;
  label: string;
  rendererLabel: string;
}

export interface ReferenceImageRequestMatrixItem extends ReferenceImageRequestLabel {
  id: string;
}

export function getReferenceImageRequestLabel(value: unknown): ReferenceImageRequestLabel;

export function getReferenceImageRequestMatrix(
  directory: string,
  requestedPath?: string,
): ReferenceImageRequestMatrixItem[];
