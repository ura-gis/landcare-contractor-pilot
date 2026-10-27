import {parcelBlockLot} from './parcel-label.js?v=20261027-labels1';
let decision;
export async function confirmPreviouslyReported(assignments,statuses) {
  const reported=assignments.filter(a=>['fulfilled','follow-up'].includes(statuses?.[a.objectId]));
  if(!reported.length) return true;
  if(decision) return decision;
  const dialog=document.getElementById('repeatReportDialog');
  const text=`You already submitted a survey for ${reported.length===1?'this parcel':`these ${reported.length} parcels`} in ${assignments[0].period}: ${reported.map(a=>parcelBlockLot(a.parcelNumber)).join(', ')}. Submit another survey? The newest submission will determine the status for this period.`;
  if(!dialog) return window.confirm(text);
  document.getElementById('repeatReportHelp').textContent=text;
  decision=new Promise(resolve=>{
    dialog.returnValue='cancel';
    dialog.addEventListener('close',()=>{const proceed=dialog.returnValue==='continue';decision=null;resolve(proceed);},{once:true});
    dialog.showModal();
  });
  return decision;
}
