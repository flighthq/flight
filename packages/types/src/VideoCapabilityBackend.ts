export interface VideoCapabilityBackend {
  canPlayType(mimeType: string): boolean;
}

export type VideoCapabilityOperation = keyof VideoCapabilityBackend;
