/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Signal<T extends (...args: any[]) => void> {
  data: SignalData<T> | null;
  emit: T;
}

export interface SignalData<T extends (...args: any[]) => void> {
  slots: T[];
  priorities: number[];
  repeat: boolean[];
  cancelled: boolean;
}
