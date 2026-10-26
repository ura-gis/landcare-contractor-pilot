import { summarizePilotReports } from './pilot-reporting.js';
import { fetchPilotResults } from './pilot-results-feed.js';

const message=document.getElementById('pilotReportMessage');
const cards=document.getElementById('pilotReportCounts');
const refresh=document.getElementById('pilotRefreshReports');
let snapshot=null;
let context={period:'',organization:'',assignments:[]};
function signal(statuses, result=null) {
  document.dispatchEvent(new CustomEvent('landcare:pilot-report-status',{detail:{...context,statuses,result,parentLayerUrl:snapshot?.parentLayerUrl}}));
}
function render() {
  cards.replaceChildren();
  if(!snapshot || !context.assignments.length) {
    signal(null);
    if(snapshot) message.textContent='Choose an organization and period to see its pilot reports.';
    return;
  }
  try {
    const result=summarizePilotReports(snapshot.parents,snapshot.children,context.assignments,context);
    for(const [label,value] of [['Reports',result.events],['Parcel visits',result.parcelVisits],['Reported parcels',result.reported],['Reported fulfilled',result.fulfilled],['Reported No only',result.followUp],['No pilot report',result.unreported]]) {
      const card=document.createElement('article');card.className='contractor-progress-card assigned';
      const title=document.createElement('span');title.textContent=label;
      const count=document.createElement('strong');count.textContent=value;
      card.append(title,count);cards.append(card);
    }
    message.textContent=`Pilot results read ${snapshot.loadedAt.toLocaleString()}. ${result.outstanding} assignments lack a reported Yes. QA: ${JSON.stringify(result.qa)}. Unreviewed provider answers; a Yes is not staff approval. These counts never update production.`;
    signal(result.statuses,result);
  } catch(error) {message.textContent=`Pilot counts unavailable: ${error.message}`;signal(null);}
}
async function reload() {
  refresh.disabled=true;
  message.textContent='Reading the pilot survey and related parcels…';
  try {snapshot=await fetchPilotResults();render();}
  catch(error) {snapshot=null;cards.replaceChildren();signal(null);message.textContent=error.message;}
  finally {refresh.disabled=false;}
}
refresh.addEventListener('click',reload);
document.addEventListener('landcare:pilot-submitted',reload);
document.addEventListener('landcare:contractor-context',event=>{
  if(context.period!==event.detail.month||context.organization!==event.detail.organization) {
    context={period:event.detail.month,organization:event.detail.organization,assignments:[]};render();
  }
});
document.addEventListener('landcare:pilot-assignments',event=>{context=event.detail;render();});
document.addEventListener('landcare:pilot-overview-ready',render);
reload();
