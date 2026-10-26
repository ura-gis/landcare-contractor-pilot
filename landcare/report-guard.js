let dirty=false, pending=false;
export function setReportDirty(value=true) {dirty=value;}
export function setReportPending(value) {pending=value;}
export function reportIsPending() {return pending;}
export function clearReportGuard() {dirty=false;pending=false;}
export function confirmReportChange() {
  if(pending) {window.alert('Your report is still submitting. Wait for confirmation before changing parcels or service period.');return false;}
  return !dirty || window.confirm('Discard this unfinished report? Your answer, photo, and comments will be cleared.');
}
window.addEventListener('beforeunload',event=>{if(dirty||pending) {event.preventDefault();event.returnValue='';}});
