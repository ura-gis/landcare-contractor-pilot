export function assignmentType(value) {
  return /request/i.test(String(value?.maintenanceLevel ?? value?.maintenance_level ?? value ?? '')) ? 'Request Only' : 'Active';
}
export function matchesAssignmentType(value,scope='all') {
  return scope==='all' || assignmentType(value)===(scope==='request'?'Request Only':'Active');
}
