import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerWebShell} from './runtime/web/registerShell';
import {inspectBrowserCapabilities} from './runtime/web/browserCapabilities';

// A tab can outlive a deployment and then request lazy chunks from the prior
// build. Vite reports those as preload errors; reload once per entry build to
// obtain the new HTML/chunk graph without risking an infinite reload loop.
window.addEventListener('vite:preloadError',event=>{
  event.preventDefault();
  window.dispatchEvent(new CustomEvent('servos:module-load-failed'));
  console.error('An application module could not load. Save your work and review Activity before restarting.');
});

void registerWebShell().catch(error=>console.warn('Offline application shell unavailable; online access remains available.',error));

void inspectBrowserCapabilities().then(support=>{
 if(support.mode==='Unsupported')return;
 document.documentElement.dataset.servosBrowserMode=support.mode;
 createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
}).catch(()=>{ /* Keep the static recovery guidance visible. */ });
