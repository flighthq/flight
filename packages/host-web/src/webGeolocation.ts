import { createWebGeolocationBackend } from '@flighthq/geolocation/contract';
import type { HostGeolocationProvider } from '@flighthq/types/contract';

export const webHostGeolocation: HostGeolocationProvider = createWebGeolocationBackend();
