import {assignmentType,matchesAssignmentType} from './assignment-type.js?v=20261027-field1';
import {parcelBlockLot} from './parcel-label.js?v=20261027-field1';
export const STATUS_LABELS={all:'All statuses',fulfilled:'Reported fulfilled','follow-up':'Needs follow-up',unreported:'Not reported',open:'Active remaining',unknown:'Reports unavailable'};
const compact=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function filterRow(row) {
  const p=row.properties||row;
  const pin=p.parcelNumber||p.parcel_number||p.parcel_key||'';
  return {id:String(p.objectId??p.objectid),type:assignmentType(p),status:p.pilot_status||p.status||'unknown',
    blockLot:parcelBlockLot(pin),pin,address:p.address||'',district:p.council_district||''};
}
export function matchesParcelFilters(row,{type='all',status='all',query=''}={}) {
  const p=filterRow(row);
  if(!matchesAssignmentType(p.type,type)) return false;
  const needle=compact(query);
  if(needle&&!compact(`${p.blockLot} ${p.pin} ${p.address}`).includes(needle)) return false;
  if(status==='all') return true;
  if(status==='open') return p.type==='Active'&&['follow-up','unreported'].includes(p.status);
  return p.status===status;
}
export function readParcelFilters() {
  return {type:document.getElementById('assignmentType').value,
    query:document.getElementById('parcelSearch').value,
    status:document.querySelector('[data-contractor-status][aria-pressed="true"]')?.dataset.contractorStatus||'all'};
}
export function compareParcels(a,b,key='block_lot',direction='asc') {
  const value=row=>{
    const p=filterRow(row);
    return ({block_lot:p.blockLot,address:p.address,maintenance_level:p.type,status:STATUS_LABELS[p.status],council_district:p.district})[key]||'';
  };
  return String(value(a)).localeCompare(String(value(b)),undefined,{numeric:true,sensitivity:'base'})*(direction==='desc'?-1:1);
}
