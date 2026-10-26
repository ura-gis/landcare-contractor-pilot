export class ParcelSelection {
  constructor() { this.items = new Map(); }
  add(assignment) {
    const first = this.values()[0];
    if (first && (first.period !== assignment.period || first.organization !== assignment.organization)) {
      throw new Error('Choose parcels from the same organization and period.');
    }
    const key = String(assignment.parcelNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!key || !assignment.objectId) throw new Error('Missing parcel identity.');
    // A parcel can appear only once, even if an assignment source repeats it.
    if (!this.values().some(item => String(item.parcelNumber).toUpperCase().replace(/[^A-Z0-9]/g, '') === key)) {
      this.items.set(String(assignment.objectId), assignment);
    }
  }
  has(id) { return this.items.has(String(id)); }
  remove(id) { this.items.delete(String(id)); }
  clear() { this.items.clear(); }
  values() { return [...this.items.values()]; }
  get size() { return this.items.size; }
}
