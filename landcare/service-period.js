export function currentPeriodLabel(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(({type, value}) => [type, value]));
  const start = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, 15));
  if (Number(parts.day) < 15) start.setUTCMonth(start.getUTCMonth() - 1);
  return start.toISOString().slice(0, 7);
}

export function assignmentPeriodLabel(period, now = new Date()) {
  const current = currentPeriodLabel(now);
  const name = period === current ? 'Current period' : period === previousPeriodLabel(current) ? 'Previous period' : 'Historical period';
  const start = new Date(`${period}-15T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 14));
  const format = new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  return `${name}: ${format.format(start)} – ${format.format(end)}`;
}

export function previousPeriodLabel(current) {
  const start = new Date(`${current}-15T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 1);
  return start.toISOString().slice(0, 7);
}
