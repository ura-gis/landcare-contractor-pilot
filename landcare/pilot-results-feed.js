const ITEM = '050caf61aecb400596b340e8ae4bdcb2';
async function json(url, params={}) {
  const target=new URL(url);
  target.search=new URLSearchParams({f:'json',...params});
  const response=await fetch(target);
  if(!response.ok) throw new Error(`Pilot results request failed (${response.status}).`);
  const result=await response.json();
  if(result.error) throw new Error(`Pilot results are not readable: ${result.error.message}. Check public results sharing.`);
  return result;
}
async function rows(url, metadata) {
  const result=[]; let offset=0;
  const size=Math.min(metadata.maxRecordCount || 1000,1000);
  while(true) {
    const page=await json(`${url}/query`,{where:'1=1',outFields:'*',returnGeometry:'false',orderByFields:`${metadata.objectIdField} ASC`,resultRecordCount:String(size),resultOffset:String(offset)});
    const batch=page.features || [];
    result.push(...batch.map(feature=>feature.attributes));
    if(!page.exceededTransferLimit && batch.length<size) return result;
    if(!batch.length) throw new Error('Pilot results pagination stopped before all rows were read.');
    offset+=batch.length;
  }
}
export async function fetchPilotResults() {
  const item=await json(`https://urap.maps.arcgis.com/sharing/rest/content/items/${ITEM}`);
  if(!item.url) throw new Error('Pilot results item has no service URL.');
  const service=item.url.replace(/\/\d+\/?$/,'').replace(/\/$/,'');
  const root=await json(service);
  const candidates=await Promise.all([...(root.layers||[]),...(root.tables||[])].map(async entry=>({url:`${service}/${entry.id}`,metadata:await json(`${service}/${entry.id}`)})));
  const has=(candidate,name)=>candidate.metadata.fields?.some(field=>field.name.toLowerCase()===name);
  const parent=candidates.find(candidate=>has(candidate,'did_you_fulfill_your_obligation'));
  const child=candidates.find(candidate=>has(candidate,'serviced_parcel_number')&&has(candidate,'parentglobalid'));
  if(!parent||!child) throw new Error('Public results must include both the survey and serviced_parcels table.');
  const [parents,children]=await Promise.all([rows(parent.url,parent.metadata),rows(child.url,child.metadata)]);
  return {parents,children,loadedAt:new Date(),source:item.title,parentLayerUrl:parent.url};
}

export async function fetchPilotReportPhotos(layerUrl, objectId) {
  if(!/^https:\/\/services1\.arcgis\.com\/0DMNBNaacQNEfN4H\/arcgis\/rest\/services\/survey123_ff3dcbb91ccb4b8f8ff003216abc6540_results\/FeatureServer\/\d+$/.test(layerUrl) || !/^\d+$/.test(String(objectId))) throw new Error('Invalid pilot attachment reference.');
  const result=await json(`${layerUrl}/${objectId}/attachments`);
  return (result.attachmentInfos || []).filter(item=>String(item.contentType).startsWith('image/')).map(item=>({
    image_url:`${layerUrl}/${objectId}/attachments/${encodeURIComponent(item.id)}`,name:item.name
  }));
}
