export async function withTimeout(promise,label,milliseconds=20000) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} took too long. Check your connection and use Reload app to retry.`)),milliseconds);})]);}
  finally {clearTimeout(timer);}
}
export async function fetchWithTimeout(url,options={},milliseconds=20000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),milliseconds);
  try {return await fetch(url,{...options,signal:controller.signal});}
  catch(error) {if(error.name==='AbortError') throw new Error('The data service took too long. Use Reload app to retry.');throw error;}
  finally {clearTimeout(timer);}
}
let mapModules;
export function loadMapModules() {
  if(!mapModules) mapModules=withTimeout(Promise.all([
    import('https://js.arcgis.com/4.30/@arcgis/core/Map.js'),
    import('https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js'),
    import('https://js.arcgis.com/4.30/@arcgis/core/Graphic.js'),
    import('https://js.arcgis.com/4.30/@arcgis/core/layers/GraphicsLayer.js'),
    import('https://js.arcgis.com/4.30/@arcgis/core/widgets/BasemapToggle.js'),
    import('https://js.arcgis.com/4.30/@arcgis/core/widgets/Zoom.js'),
    import('./map-location.js?v=20261027-survey1')
  ]),'The map library').catch(error=>{mapModules=null;throw error;});
  return mapModules;
}

export function waitForWorkspaceTab(tab) {
  if(document.body.dataset.activeTab===tab) return Promise.resolve();
  return new Promise(resolve=>{
    const onTab=()=>{if(document.body.dataset.activeTab===tab) {document.removeEventListener('landcare:tab-changed',onTab);resolve();}};
    document.addEventListener('landcare:tab-changed',onTab);
  });
}
