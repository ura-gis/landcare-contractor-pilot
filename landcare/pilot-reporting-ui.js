import { summarizePilotReports } from './pilot-reporting.js?v=20261027-field3';
import { fetchPilotResults } from './pilot-results-feed.js?v=20261027-field3';

const message=document.getElementById('pilotReportMessage');
const cards=document.getElementById('pilotReportCounts');
const refresh=document.getElementById('pilotRefreshReports');
let snapshot=null,loadVersion=0;
let context={period:'',organization:'',assignments:[]};
function signal(statuses, result=null) {
  document.dispatchEvent(new CustomEvent('landcare:pilot-report-status',{detail:{...context,statuses,result,parentLayerUrl:snapshot?.parentLayerUrl}}));
}
function render() {
  cards.replaceChildren();
  if(!snapshot || !context.assignments.length) {
    signal(null);
    if(snapshot) {message.textContent='Choose an organization and period to see its reports.';document.getElementById('pilotFeedStatus').textContent='Choose your organization to see progress.';}
    return;
  }
  try {
    const result=summarizePilotReports(snapshot.parents,snapshot.children,context.assignments,context);
    for(const [label,value] of [['Reports',result.events],['Parcel visits',result.parcelVisits],['Reported parcels',result.reported],['Reported fulfilled',result.fulfilled],['Latest report No',result.followUp],['No pilot report',result.unreported]]) {
      const card=document.createElement('article');card.className='diagnostic-count';
      const title=document.createElement('span');title.textContent=label;
      const count=document.createElement('strong');count.textContent=value;
      card.append(title,count);cards.append(card);
    }
    message.textContent=`Last updated ${snapshot.loadedAt.toLocaleString()}. ${result.outstanding} Active parcels have no report or their latest answer is No. Data checks: ${JSON.stringify(result.qa)}.`;
    document.getElementById('pilotFeedStatus').textContent=`Updated ${snapshot.loadedAt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · contractor reports, not staff approval.`;
    signal(result.statuses,result);
  } catch(error) {message.textContent=`Pilot counts unavailable: ${error.message}`;document.getElementById('pilotFeedStatus').textContent='Progress unavailable. Refresh progress to retry.';signal(null);}
}
async function reload() {
  const version=++loadVersion,scope={period:context.period,organization:context.organization};
  if(!scope.period||!scope.organization||!context.assignments.length) {snapshot=null;refresh.disabled=false;render();return;}
  refresh.disabled=true;
  message.textContent='Reading reports…';
  document.getElementById('pilotFeedStatus').textContent='Refreshing progress…';
  try {const loaded=await fetchPilotResults(scope);if(version!==loadVersion)return;snapshot=loaded;render();}
  catch(error) {if(version!==loadVersion)return;snapshot=null;cards.replaceChildren();signal(null);message.textContent=error.message;document.getElementById('pilotFeedStatus').textContent='Progress unavailable. Your selection is preserved; use Refresh progress to retry.';}
  finally {if(version===loadVersion)refresh.disabled=false;}
}
refresh.addEventListener('click',reload);
document.addEventListener('landcare:pilot-submitted',reload);
document.addEventListener('landcare:contractor-context',event=>{
  if(context.period!==event.detail.month||context.organization!==event.detail.organization) {
    loadVersion++;snapshot=null;context={period:event.detail.month,organization:event.detail.organization,assignments:[]};render();
  }
});
document.addEventListener('landcare:pilot-assignments',event=>{context=event.detail;reload();});
document.addEventListener('landcare:pilot-overview-ready',render);
reload();

