import {readParcelFilters,STATUS_LABELS} from './parcel-filters.js?v=20261027-field3';
const type=document.getElementById('assignmentType'),search=document.getElementById('parcelSearch');
const buttons=[...document.querySelectorAll('[data-contractor-status]')];
function setStatus(status) {
  for(const button of buttons) {
    const active=button.dataset.contractorStatus===status;
    button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
    if(button.dataset.contractorStatus==='open') {button.disabled=type.value==='request';button.title=button.disabled?'Active remaining applies only to Active parcels.':'Active parcels whose latest report is No, or have no report';}
  }
}
function emit() {
  const filters=readParcelFilters();
  const url=new URL(location.href);
  for(const [key,value,defaultValue] of [['type',filters.type,'all'],['status',filters.status,'all'],['q',filters.query,'']]) {
    if(value===defaultValue) url.searchParams.delete(key);else url.searchParams.set(key,value);
  }
  history.replaceState({},'',url);
  document.dispatchEvent(new CustomEvent('landcare:filters-changed',{detail:filters}));
}
function restore() {
  const params=new URLSearchParams(location.search);
  type.value=['all','active','request'].includes(params.get('type'))?params.get('type'):'all';
  search.value=params.get('q')||'';
  let status=params.get('status')||'all';if(!STATUS_LABELS[status]||status==='unknown'||(status==='open'&&type.value==='request')) status='all';
  setStatus(status);
}
for(const button of buttons) button.addEventListener('click',()=>{setStatus(button.dataset.contractorStatus);emit();});
type.addEventListener('change',()=>{setStatus(type.value==='request'&&readParcelFilters().status==='open'?'all':readParcelFilters().status);emit();});
search.addEventListener('input',emit);
document.getElementById('clearParcelFilters').addEventListener('click',()=>{type.value='all';search.value='';setStatus('all');emit();});
window.addEventListener('popstate',()=>{restore();emit();});
restore();
