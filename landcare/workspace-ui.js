const progress=document.getElementById('compactProgress');
document.addEventListener('landcare:pilot-report-status',event=>{
 const r=event.detail.result;
 progress.textContent=r?`Survey Yes: ${r.fulfilled} of ${r.assigned} Active parcels - ${r.outstanding} remaining`:'Organization progress unavailable';
});
document.addEventListener('landcare:filters-changed',event=>{
 const f=event.detail,n=Number(f.type!=='all')+Number(f.status!=='all')+Number(!!f.query);
 document.getElementById('filterBadge').textContent=n?`(${n} applied)`:'';
});

document.getElementById('copyOrganizationLink').addEventListener('click',async()=>{
 const selected=document.getElementById('assignmentOrganization');if(!selected.value)return;
 const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('organization',selected.options[selected.selectedIndex].text);url.searchParams.set('tab','submit');
 try{await navigator.clipboard.writeText(url.href);document.getElementById('organizationLinkStatus').textContent='Organization link copied. It opens the current period.';}catch{document.getElementById('organizationLinkStatus').textContent=url.href;}
});
