import {newestReportFirst} from './latest-report.js?v=20261027-overview1';
export function pilotOverviewFeatures(features, detail) {
  return features.map(feature=>{
    const props=feature.properties || {};
    const id=String(props.objectid);
    const records=[...(detail?.result?.recordsByAssignment?.[id] || [])].sort(newestReportFirst);
    return {...feature,properties:{...props,pilot_status:detail?.statuses?.[id] || 'unknown',pilot_reports:records,
      returned_flag:detail?.statuses?.[id]==='fulfilled',submitted_at:records[0]?.submittedAt || null}};
  });
}

export function pilotStatusLabel(status) {
  return ({fulfilled:'Survey complete (Yes)', 'follow-up':'Needs follow-up', unreported:'No survey',unknown:'Pilot results unavailable'})[status] || 'Pilot results unavailable';
}
