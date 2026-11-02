import { Role, VisitStatus, VisitType } from '@gatepass/shared';
import type { Actor, VisitSnapshot } from '../src/visits/state/visit-state.machine';

/** Fixed clock for tests: Mon 2026-11-02 10:00 IST (docs/specs/TESTING.md §3). */
export const NOW = new Date('2026-11-02T04:30:00Z');
export const TODAY = '2026-11-02';
export const TOMORROW = '2026-11-03';

/** Stable UUIDs so unit and integration tests share the same cast (TESTING.md §3). */
export const actors = {
  alice: { id: '00000000-0000-4000-8000-000000000001', role: Role.EMPLOYEE },
  bob: { id: '00000000-0000-4000-8000-000000000002', role: Role.EMPLOYEE },
  carol: { id: '00000000-0000-4000-8000-000000000003', role: Role.ADMIN },
  frank: { id: '00000000-0000-4000-8000-000000000004', role: Role.ADMIN },
  guard1: { id: '00000000-0000-4000-8000-000000000011', role: Role.SECURITY },
  guard2: { id: '00000000-0000-4000-8000-000000000012', role: Role.SECURITY },
} satisfies Record<string, Actor>;

export const users = {
  alice: { ...actors.alice, email: 'alice@coditas.com', name: 'Alice Host', isActive: true },
  bob: { ...actors.bob, email: 'bob@coditas.com', name: 'Bob Employee', isActive: true },
  carol: { ...actors.carol, email: 'carol@coditas.com', name: 'Carol Admin', isActive: true },
  frank: { ...actors.frank, email: 'frank@coditas.com', name: 'Frank Admin', isActive: true },
  eve: {
    id: '00000000-0000-4000-8000-000000000005',
    role: Role.EMPLOYEE,
    email: 'eve@coditas.com',
    name: 'Eve Inactive',
    isActive: false,
  },
  guard1: { ...actors.guard1, email: 'guard1@coditas.com', name: 'Guard One', isActive: true },
  guard2: { ...actors.guard2, email: 'guard2@coditas.com', name: 'Guard Two', isActive: true },
};

export const visitors = {
  rahul: { fullName: 'Rahul Sharma', phone: '+919876543210', company: 'Acme Corp' },
  meera: { fullName: 'Meera Iyer', phone: '+919812345678', company: null },
};

export const photos = {
  visitorPhotoKey: 'visits/2026/11/0f8b6a3e-visitor.jpg',
  idPhotoKey: 'visits/2026/11/7c1d9e2a-id.jpg',
};

export function makeVisit(overrides: Partial<VisitSnapshot> = {}): VisitSnapshot {
  return {
    id: 'v-1',
    type: VisitType.PLANNED,
    status: VisitStatus.SCHEDULED,
    hostId: actors.alice.id,
    visitDate: TODAY,
    escalatedAt: null,
    ...overrides,
  };
}
