import { PURPOSE_LABELS } from '@gatepass/shared';

/** Phase 0 placeholder. Routing, auth and real screens arrive in Phase 1+. */
export function App() {
  return (
    <main>
      <h1>Coditas Gate Pass</h1>
      <p>Visit purposes: {Object.values(PURPOSE_LABELS).join(', ')}</p>
    </main>
  );
}
