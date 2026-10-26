// Display only. Full normalized parcel IDs remain the storage and matching keys.
export function parcelBlockLot(value) {
  const raw = String(value || '').trim().toUpperCase();
  const full = raw.replace(/[^A-Z0-9]/g, '');
  const pin = full.match(/^(\d{4})([A-Z])(\d{5})\d{6}$/);
  if (pin) return `${Number(pin[1])}-${pin[2]}-${Number(pin[3])}`;
  const short = raw.match(/^(\d+)\s*-?\s*([A-Z])\s*-?\s*(\d+)$/);
  if (short) return `${Number(short[1])}-${short[2]}-${Number(short[3])}`;
  return raw || 'Parcel';
}
