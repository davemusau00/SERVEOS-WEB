/** Shell caching does not enable offline transactional rights. Those require grants. */
export async function registerWebShell(){
  if(!import.meta.env.PROD||import.meta.env.VITE_ENABLE_WEB_OFFLINE!=='true'||'__TAURI_INTERNALS__' in window||!('serviceWorker' in navigator))return;
  await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
}
