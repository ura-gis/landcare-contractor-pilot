// Original creation time determines the latest submission; edits do not reorder reports.
function submittedTime(value) {
  const numeric=Number(value);
  if(value!==null && value!=='' && Number.isFinite(numeric)) return numeric;
  const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:0;
}
export function newestReportFirst(a,b) {
  return submittedTime(b.submittedAt)-submittedTime(a.submittedAt)
    || String(b.eventId||'').localeCompare(String(a.eventId||''));
}
