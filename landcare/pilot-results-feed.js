import { fetchWithTimeout } from './loading.js?v=20261027-field3';
const ITEM = '050caf61aecb400596b340e8ae4bdcb2';
async function json(url, params={}) {
  const target=new URL(url);
  target.search=new URLSearchParams({f:'json',...params});
  const response=await fetchWithTimeout(target);
  if(!response.ok) throw new Error(`Pilot results request failed (${response.status}).`);
  const result=await response.json();
  if(result.error) throw new Error(`Pilot results are not readable: ${result.error.message}. Check public results sharing.`);
  return result;
}
async function rows(url, metadata, where='1=1') {
  const result=[]; let offset=0;
  const size=Math.min(metadata.maxRecordCount || 1000,1000);
  while(true) {
    const page=await json(`${url}/query`,{where,outFields:'*',returnGeometry:'false',orderByFields:`${metadata.objectIdField} ASC`,resultRecordCount:String(size),resultOffset:String(offset)});
    const batch=page.features || [];
    result.push(...batch.map(feature=>feature.attributes));
    if(!page.exceededTransferLimit && batch.length<size) return result;
    if(!batch.length) throw new Error('Pilot results pagination stopped before all rows were read.');
    offset+=batch.length;
  }
}
export async function fetchPilotResults(scope={}) {
  const item=await json(`https://urap.maps.arcgis.com/sharing/rest/content/items/${ITEM}`);
  if(!item.url) throw new Error('Pilot results item has no service URL.');
  const service=item.url.replace(/\/\d+\/?$/,'').replace(/\/$/,'');
  const root=await json(service);
  const candidates=await Promise.all([...(root.layers||[]),...(root.tables||[])].map(async entry=>({url:`${service}/${entry.id}`,metadata:await json(`${service}/${entry.id}`)})));
  const has=(candidate,name)=>candidate.metadata.fields?.some(field=>field.name.toLowerCase()===name);
  const parent=candidates.find(candidate=>has(candidate,'did_you_fulfill_your_obligation'));
  const child=candidates.find(candidate=>has(candidate,'serviced_parcel_number')&&has(candidate,'parentglobalid'));
  if(!parent||!child) throw new Error('Public results must include both the survey and serviced_parcels table.');
  const escape=value=>String(value).replace(/'/g,"''");
  const where=scope.period&&scope.organization?`assignment_period = '${escape(scope.period)}' AND organization = '${escape(scope.organization)}'`:'1=1';
  const parents=await rows(parent.url,parent.metadata,where);
  let children=[];
  if(scope.period&&scope.organization) {
    const ids=parents.map(p=>p.globalid||p.GlobalID).filter(Boolean);
    for(let i=0;i<ids.length;i+=100) children.push(...await rows(child.url,child.metadata,`parentglobalid IN (${ids.slice(i,i+100).map(id=>"'"+escape(id)+"'").join(',')})`));
  } else children=await rows(child.url,child.metadata);
  return {parents,children,loadedAt:new Date(),source:item.title,parentLayerUrl:parent.url};
}

export async function fetchPilotReportPhotos(layerUrl, objectId) {
  if(!/^https:\/\/services1\.arcgis\.com\/0DMNBNaacQNEfN4H\/arcgis\/rest\/services\/survey123_ff3dcbb91ccb4b8f8ff003216abc6540_results\/FeatureServer\/\d+$/.test(layerUrl) || !/^\d+$/.test(String(objectId))) throw new Error('Invalid pilot attachment reference.');
  const result=await json(`${layerUrl}/${objectId}/attachments`);
  return (result.attachmentInfos || []).filter(item=>String(item.contentType).startsWith('image/')).map(item=>({
    image_url:`${layerUrl}/${objectId}/attachments/${encodeURIComponent(item.id)}`,name:item.name
  }));
}
