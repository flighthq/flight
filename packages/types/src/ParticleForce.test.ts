import type { AttractorForce } from './AttractorForce';
import type { DragForce } from './DragForce';
import type { ParticleForce } from './ParticleForce';
import type { TurbulenceForce } from './TurbulenceForce';
import type { VortexForce } from './VortexForce';
import type { WindForce } from './WindForce';

// ParticleForce is a closed discriminated union — verify exhaustiveness at the type level.
// If a new member is added to the union, these exhaustiveness checks will produce a type error,
// making the closed-by-design contract machine-verified.

function assertNever(value: never): never {
  throw new Error(`Unhandled ParticleForce kind: ${(value as ParticleForce).kind}`);
}

function handleParticleForce(force: ParticleForce): string {
  switch (force.kind) {
    case 'AttractorForce':
      return 'attractor';
    case 'DragForce':
      return 'drag';
    case 'TurbulenceForce':
      return 'turbulence';
    case 'VortexForce':
      return 'vortex';
    case 'WindForce':
      return 'wind';
    default:
      // If ParticleForce gains a new member, this line becomes a type error.
      return assertNever(force);
  }
}

describe('ParticleForce', () => {
  describe('closed discriminated union', () => {
    it('handles AttractorForce', () => {
      const force: AttractorForce = { kind: 'AttractorForce', x: 0, y: 0, strength: 1 };
      expect(handleParticleForce(force)).toBe('attractor');
    });

    it('handles DragForce', () => {
      const force: DragForce = { kind: 'DragForce', strength: 0.5 };
      expect(handleParticleForce(force)).toBe('drag');
    });

    it('handles TurbulenceForce', () => {
      const force: TurbulenceForce = { kind: 'TurbulenceForce', strength: 1, scale: 0.1 };
      expect(handleParticleForce(force)).toBe('turbulence');
    });

    it('handles VortexForce', () => {
      const force: VortexForce = { kind: 'VortexForce', x: 0, y: 0, strength: 1 };
      expect(handleParticleForce(force)).toBe('vortex');
    });

    it('handles WindForce', () => {
      const force: WindForce = { kind: 'WindForce', x: 1, y: 0 };
      expect(handleParticleForce(force)).toBe('wind');
    });
  });

  describe('union membership', () => {
    it('AttractorForce is assignable to ParticleForce', () => {
      const force: AttractorForce = { kind: 'AttractorForce', x: 0, y: 0, strength: 1 };
      const asBase: ParticleForce = force;
      expect(asBase.kind).toBe('AttractorForce');
    });

    it('DragForce is assignable to ParticleForce', () => {
      const force: DragForce = { kind: 'DragForce', strength: 0.5 };
      const asBase: ParticleForce = force;
      expect(asBase.kind).toBe('DragForce');
    });

    it('TurbulenceForce is assignable to ParticleForce', () => {
      const force: TurbulenceForce = { kind: 'TurbulenceForce', strength: 1, scale: 0.1 };
      const asBase: ParticleForce = force;
      expect(asBase.kind).toBe('TurbulenceForce');
    });

    it('VortexForce is assignable to ParticleForce', () => {
      const force: VortexForce = { kind: 'VortexForce', x: 0, y: 0, strength: 1 };
      const asBase: ParticleForce = force;
      expect(asBase.kind).toBe('VortexForce');
    });

    it('WindForce is assignable to ParticleForce', () => {
      const force: WindForce = { kind: 'WindForce', x: 1, y: 0 };
      const asBase: ParticleForce = force;
      expect(asBase.kind).toBe('WindForce');
    });
  });
});

// Exhaustiveness compile check: ParticleForce union equals the known members
type _AllForceKinds = ParticleForce['kind'];
type _ExpectedKinds =
  | AttractorForce['kind']
  | DragForce['kind']
  | TurbulenceForce['kind']
  | VortexForce['kind']
  | WindForce['kind'];
type _KindsMatch = _AllForceKinds extends _ExpectedKinds
  ? _ExpectedKinds extends _AllForceKinds
    ? true
    : false
  : false;
const _kindsMatch: _KindsMatch = true;
void _kindsMatch;
