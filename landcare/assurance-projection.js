import {currentPeriodLabel} from './service-period.js?v=20261027-locate2';
import {newestReportFirst} from './latest-report.js?v=20261027-locate2';
import {ASSIGNMENT_HISTORY_LAYER_URL} from './survey-submission-config.js?v=20261027-locate2';
import {assignmentType} from './assignment-type.js?v=20261027-locate2';
const pin=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const guid=v=>String(v||'').replace(/[{}]/g,'').toLowerCase();
const org=v=>String(v||'').replace(/\s+Primary Contact$/i,'').trim();
const lower=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase(),v]));
export function projectAssuranceResults({parents,children,assignments,photosByEvent={}},scope) {
 const scoped=assignments.filter(a=>a.period===scope.period&&org(a.organization)===org(scope.organization));
 const byId=new Map(scoped.map(a=>[String(a.objectId),a]));
 const exceptions=[],visits=[],seen=new Set();
 const fail=(eventId,reason)=>exceptions.push({event_id:eventId,reason});
 for(const raw of parents) {
  const p=lower(raw),eventId=guid(p.globalid);
  if(p.assignment_period!==scope.period||org(p.organization)!==org(scope.organization)) continue;
  if(!eventId||seen.has(eventId)) {fail(eventId,'Missing or duplicate event identity');continue;}seen.add(eventId);
  const time=Number(p.creationdate);
  if(!Number.isFinite(time)||time<=0||!['Yes','No'].includes(p.did_you_fulfill_your_obligation)) {fail(eventId,'Invalid creation time or fulfillment answer');continue;}
  const photos=photosByEvent[eventId];
  const verifiedPhotos=Array.isArray(photos)&&photos.length>0&&photos.every(photo=>/^https:\/\//.test(photo.image_url||''));
  if(!verifiedPhotos) fail(eventId,'Photo missing or could not be verified');
  const links=children.map(lower).filter(c=>guid(c.parentglobalid)===eventId),pairs=new Set(),resolved=[];
  let invalid=!links.length;
  for(const c of links) {
   let reference;try {reference=new URL(c.serviced_assignment_reference);} catch {invalid=true;continue;}
   const id=new URLSearchParams(reference.hash.slice(1)).get('objectid'),a=byId.get(id),key=pin(c.serviced_parcel_number);
   if(!a||reference.origin+reference.pathname!==ASSIGNMENT_HISTORY_LAYER_URL||reference.search||key!==pin(a.parcelNumber)||pairs.has(key)) {invalid=true;continue;}
   pairs.add(key);resolved.push({a,c,key});
  }
  if(invalid) {fail(eventId,'Incomplete, duplicate or unmatched parcel links; whole group excluded');continue;}
  for(const {a,c,key} of resolved) visits.push({eventId,submittedAt:time,answer:p.did_you_fulfill_your_obligation,
   record_id:`survey123:${eventId}:${key}`,event_id:eventId,child_id:guid(c.globalid),assignment_key:JSON.stringify([scope.period,key,org(a.organization)]),
   assignment_object_id:a.objectId,parcelnumb:key,parcel_number:key,address:a.address,maintained_by:org(a.organization),maintenance_level:assignmentType(a),
   period_label:scope.period,period:`${scope.period}-15`,created_at:time,submission_period:currentPeriodLabel(new Date(time)),is_late:currentPeriodLabel(new Date(time))!==scope.period,
   additional_notes:p.comments||'',fulfillment_answer:p.did_you_fulfill_your_obligation,evidence_source:'Survey123 contractor survey',
   qualified:!!verifiedPhotos,photos:verifiedPhotos?photos:[],image_url:verifiedPhotos?photos[0].image_url:"",geometry:a.geometry});
 }
 const latest=new Map();
 for(const row of visits.sort(newestReportFirst)) if(!latest.has(row.assignment_key)) latest.set(row.assignment_key,row);
 const latestRows=[...latest.values()],active=scoped.filter(a=>assignmentType(a)==='Active');
 return {schema_version:1,validation_complete:exceptions.length===0,scope,generated_at:new Date().toISOString(),visits,latest:latestRows,exceptions,
  totals:{active_assigned:active.length,active_fulfilled:latestRows.filter(r=>r.maintenance_level==='Active'&&r.answer==='Yes'&&r.qualified).length,report_events:new Set(visits.map(r=>r.eventId)).size,parcel_visits:visits.length,request_only_assigned:scoped.length-active.length},
  geojson:{type:'FeatureCollection',features:latestRows.map(({geometry,...properties})=>({type:'Feature',geometry,properties}))}};
}
