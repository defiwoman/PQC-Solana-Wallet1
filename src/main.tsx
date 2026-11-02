import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main>
      <h1>PQC Solana Wallet</h1>
      <p>Experimental project scaffold for local development.</p>
      <p>Wallet operations and post-quantum authorization are not implemented.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
