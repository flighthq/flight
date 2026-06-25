export interface TextInputEditRecord {
  caretIndexAfter: number;
  caretIndexBefore: number;
  mergeKind: string | null;
  selectionIndexAfter: number;
  selectionIndexBefore: number;
  textAfter: string;
  textBefore: string;
}
