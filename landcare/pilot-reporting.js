import {newestReportFirst} from './latest-report.js?v=20261027-contrast1';
import { ASSIGNMENT_HISTORY_LAYER_URL } from './survey-submission-config.js?v=20261027-contrast1';
import { assignmentType } from './assignment-type.js?v=20261027-contrast1';

const pin = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const guid = value => String(value || '').trim().replace(/[{}]/g, '').toLowerCase();
const org = value => String(value || '').replace(/\s+Primary Contact$/i, '').trim();
const lower = row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key.toLowerCase(),value]));

export function summarizePilotReports(parents, children, assignments, {period, organization}) {
  const scoped=assignments.filter(a=>a.period===period && org(a.organization)===org(organization));
  const byId=new Map(scoped.map(a=>[String(a.objectId),a]));
  const statuses=Object.fromEntries(scoped.map(a=>[String(a.objectId),'unreported']));
  const events=new Map(); const qa={invalidParents:0, duplicateParents:0, unmatchedLinks:0, duplicateLinks:0};
  for(const original of parents) {
    const p=lower(original); const id=guid(p.globalid);
    if(!id) {qa.invalidParents++;continue;}
    if(events.has(id)) {qa.duplicateParents++;throw new Error('Duplicate parent GlobalID in export. Export one complete survey table.');}
    events.set(id,p);
  }
  const pairs=new Set(); const matchedEvents=new Set(); const reported=new Set(); const fulfilled=new Set();
  const recordsByAssignment=Object.fromEntries(scoped.map(a=>[String(a.objectId),[]]));
  for(const original of children) {
    const child=lower(original); const parentId=guid(child.parentglobalid); const p=events.get(parentId);
    if(!p) {qa.unmatchedLinks++;continue;}
    if(p.assignment_period!==period || org(p.organization)!==org(organization)) continue;
    let ref;
    try {ref=new URL(child.serviced_assignment_reference);} catch {qa.unmatchedLinks++;continue;}
    const id=new URLSearchParams(ref.hash.slice(1)).get('objectid');
    const assignment=byId.get(id);
    const validReference=ref.origin+ref.pathname===ASSIGNMENT_HISTORY_LAYER_URL && !ref.search;
    if(!assignment || !validReference || pin(child.serviced_parcel_number)!==pin(assignment.parcelNumber)) {qa.unmatchedLinks++;continue;}
    if(!['Yes','No'].includes(p.did_you_fulfill_your_obligation)) {qa.invalidParents++;continue;}
    const pair=`${parentId}|${id}`;
    if(pairs.has(pair)) {qa.duplicateLinks++;continue;}
    pairs.add(pair); matchedEvents.add(parentId); reported.add(id);
    recordsByAssignment[id].push({eventId:parentId,objectId:p.objectid,answer:p.did_you_fulfill_your_obligation,
      submittedAt:p.creationdate ?? null,comments:p.comments || ''});

  }
  for(const id of reported) {
    recordsByAssignment[id].sort(newestReportFirst);
    if(recordsByAssignment[id][0].answer==='Yes') fulfilled.add(id);
    statuses[id]=fulfilled.has(id)?'fulfilled':'follow-up';
  }
  const totals=type=>{
    const rows=scoped.filter(a=>assignmentType(a)===type);
    const ids=rows.map(a=>String(a.objectId));
    const visits=ids.flatMap(id=>recordsByAssignment[id]);
    const reportedCount=ids.filter(id=>reported.has(id)).length;
    const fulfilledCount=ids.filter(id=>fulfilled.has(id)).length;
    return {assigned:ids.length,events:new Set(visits.map(r=>r.eventId)).size,parcelVisits:visits.length,
      reported:reportedCount,fulfilled:fulfilledCount,followUp:reportedCount-fulfilledCount,
      unreported:ids.length-reportedCount,outstanding:ids.length-fulfilledCount};
  };
  return {...totals('Active'),requestOnly:totals('Request Only'),statuses,recordsByAssignment,qa};
}

