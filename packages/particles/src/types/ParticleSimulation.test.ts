import type { ParticleForce } from './ParticleSimulation.ts';

function handleParticleForce(force: ParticleForce): string {
  switch (force.kind) {
    case 'AttractorForce':
    case 'DragForce':
    case 'TurbulenceForce':
    case 'VortexForce':
    case 'WindForce':
      return force.kind;
    default:
      return force satisfies never;
  }
}

describe('ParticleForce', () => {
  it('remains an exhaustive closed discriminated union', () => {
    expect(handleParticleForce({ kind: 'WindForce', x: 1, y: 0 })).toBe('WindForce');
  });
});
