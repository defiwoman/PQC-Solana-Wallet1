import { DEVELOPMENT_STAGES, PROJECT_STATUS } from '@pqc-wallet/sdk';

export function App() {
  return (
    <main>
      <header>
        <p className="eyebrow">Solana wallet research</p>
        <h1>{PROJECT_STATUS.name}</h1>
        <p className="notice">{PROJECT_STATUS.notice}</p>
      </header>
      <section className="security" aria-labelledby="security-title">
        <h2 id="security-title">Security status</h2>
        <p><strong>{PROJECT_STATUS.security}</strong></p>
        <p>{PROJECT_STATUS.implementation}</p>
        <p>No wallet connection or recovery phrase is needed to view this page.</p>
      </section>
      <section aria-labelledby="stages-title">
        <h2 id="stages-title">Development stages</h2>
        <ol>
          {DEVELOPMENT_STAGES.map((stage) => (
            <li key={stage.id}>
              <h3>{stage.title}</h3>
              <p>{stage.status}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
