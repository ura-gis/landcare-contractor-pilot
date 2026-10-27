import {withTimeout} from './loading.js?v=20261027-contrast1';
export const IMAGERY_2025={
 title:'2025 EagleView imagery',
 // Exact 2025 layer and REST tile template from the supplied WMTS capabilities.
 layerId:'PICT-PAALLE25-ptPl90UqRJ',
 urlTemplate:'https://svc.pictometry.com/Image/5E307362-99E1-D07A-9E31-7208ADB7BA72/wmts/PICT-PAALLE25-ptPl90UqRJ/default/GoogleMapsCompatible/{level}/{col}/{row}.png',
 copyright:'Copyright Pictometry 2025 / EagleView',
 tileInfo:{dpi:96,rows:256,cols:256,spatialReference:{wkid:3857},origin:{x:-20037508.342789244,y:20037508.342789244},lods:Array.from({length:22},(_,level)=>({level,resolution:156543.03392804097/2**level,scale:559082264.0287178/2**level}))},
 fullExtent:{xmin:-8945806.6405678,ymin:4894034.9677513,xmax:-8870136.0718915,ymax:4965196.5452283,spatialReference:{wkid:3857}}
};
let modules;
async function createImageryBasemap(){
 modules??=Promise.all([import('https://js.arcgis.com/4.30/@arcgis/core/Basemap.js'),import('https://js.arcgis.com/4.30/@arcgis/core/layers/WebTileLayer.js')]).catch(error=>{modules=null;throw error;});
 const [{default:Basemap},{default:WebTileLayer}]=await withTimeout(modules,'Imagery library');
 const {layerId,...properties}=IMAGERY_2025;
 const layer=new WebTileLayer({...properties,id:layerId});
 await withTimeout(layer.load(),'2025 imagery');
 return new Basemap({title:IMAGERY_2025.title,id:'eagleview-2025',baseLayers:[layer]});
}
export function addImageryBasemapToggle(view,create=createImageryBasemap){
 const streets=view.map.basemap;
 const button=document.createElement('button');button.type='button';button.className='esri-widget imagery-basemap-toggle';button.textContent='2025 imagery';button.setAttribute('aria-pressed','false');button.title='Switch to 2025 EagleView imagery';
 const error=document.createElement('p');error.className='imagery-basemap-error';error.setAttribute('role','status');error.hidden=true;view.container.insertAdjacentElement('afterend',error);
 let imagery,active=false,busy=false;
 button.addEventListener('click',async()=>{
  if(busy)return;busy=true;button.disabled=true;error.hidden=true;
  try {
   if(active){view.map.basemap=streets;active=false;}
   else {button.textContent='Loading imagery...';imagery??=await create();view.map.basemap=imagery;await withTimeout(view.whenLayerView(imagery.baseLayers.getItemAt(0)),'2025 imagery display');active=true;}
  }catch(e){view.map.basemap=streets;active=false;imagery=null;error.textContent='2025 imagery could not load. Street map restored. Try again.';error.hidden=false;}
  finally{busy=false;button.disabled=false;button.textContent=active?'Street map':'2025 imagery';button.title=active?'Switch to street map':'Switch to 2025 EagleView imagery';button.setAttribute('aria-pressed',String(active));}
 });
 view.ui.add(button,{position:'bottom-left',index:0});return button;
}
