const progress=document.getElementById('compactProgress');
document.addEventListener('landcare:pilot-report-status',event=>{
 const r=event.detail.result;
 progress.textContent=r?`${r.fulfilled} of ${r.assigned} Active parcels reported fulfilled - ${r.outstanding} remaining`:'Organization progress unavailable';
});
document.addEventListener('landcare:filters-changed',event=>{
 const f=event.detail,n=Number(f.type!=='all')+Number(f.status!=='all')+Number(!!f.query);
 document.getElementById('filterBadge').textContent=n?`(${n} applied)`:'';
});
