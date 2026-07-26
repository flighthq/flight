import type { ContactShadowsEffect } from '@flighthq/types/contract';

export function createContactShadowsEffect(
  options: Readonly<Omit<ContactShadowsEffect, 'kind'>> = {},
): ContactShadowsEffect {
  return { kind: 'ContactShadowsEffect', ...options };
}
