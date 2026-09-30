import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerWebShell} from './runtime/web/registerShell';

// A tab can outlive a deployment and then request lazy chunks from the prior
// build. Vite reports those as preload errors; reload once to obtain the new
// HTML/chunk graph without risking an infinite reload loop.
window.addEventListener('vite:preloadError',event=>{
  event.preventDefault();
  const key='servos:preload-reload';
  if(sessionStorage.getItem(key)){
    console.error('This page could not load a current application module. Reload the page to retry.');
    return;
  }
  sessionStorage.setItem(key,'1');
  window.location.reload();
});
window.setTimeout(()=>sessionStorage.removeItem('servos:preload-reload'),20_000);

void registerWebShell().catch(error=>console.warn('Offline application shell unavailable; online access remains available.',error));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
