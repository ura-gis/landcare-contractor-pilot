let dirty=false, pending=false;
export function setReportDirty(value=true) {dirty=value;}
export function setReportPending(value) {pending=value;}
export function reportIsPending() {return pending;}
export function clearReportGuard() {dirty=false;pending=false;}
let decision;
export async function confirmReportChange() {
  if(pending) {window.alert('Your report is still submitting. Wait for confirmation before changing parcels or service period.');return false;}
  if(!dirty) return true;
  const dialog=document.getElementById('discardReportDialog');
  if(!dialog) return window.confirm('Discard this unfinished report? Your answer, photo, and comments will be cleared.');
  if(decision) return decision;
  decision=new Promise(resolve=>{
    dialog.returnValue='keep';
    dialog.addEventListener('close',()=>{const discard=dialog.returnValue==='discard';decision=null;if(discard) document.dispatchEvent(new Event('landcare:discard-report'));resolve(discard);},{once:true});
    dialog.showModal();
  });
  return decision;
}
window.addEventListener('beforeunload',event=>{if(dirty||pending) {event.preventDefault();event.returnValue='';}});
