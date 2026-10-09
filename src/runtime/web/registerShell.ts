/** Shell caching does not enable offline transactional rights. Those require grants. */
export async function registerWebShell(){
  if(!import.meta.env.PROD||import.meta.env.VITE_ENABLE_WEB_OFFLINE!=='true'||!('serviceWorker' in navigator))return;
  const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  if(registration.waiting&&navigator.serviceWorker.controller)window.dispatchEvent(new CustomEvent('servos:sw-update-ready'));
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;
    if(!worker)return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed'&&navigator.serviceWorker.controller){
        window.dispatchEvent(new CustomEvent('servos:sw-update-ready'));
      }
    });
  });
}
