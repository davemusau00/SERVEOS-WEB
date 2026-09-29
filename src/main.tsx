import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerWebShell} from './runtime/web/registerShell';

void registerWebShell().catch(error=>console.warn('Offline application shell unavailable; online access remains available.',error));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
