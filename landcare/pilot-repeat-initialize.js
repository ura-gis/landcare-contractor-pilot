import { verifyRepeatValues } from './pilot-repeat-data.js?v=20261027-labels1';

// Populate only after the repeat exists. Never retry a write: delayed API
// visibility may be polled, but appending again could duplicate child records.
export async function initializeRepeat(form, expected, isCurrent, pause = () => new Promise(resolve => setTimeout(resolve, 150))) {
  if (!isCurrent()) return false;
  const rows = expected.serviced_parcels;
  const initial = Number(await form.getRepeatCount('serviced_parcels'));
  if (!isCurrent()) return false;
  if (initial === 0) {
    await form.addRepeat({ questionName: 'serviced_parcels', count: rows.length, questionValues: rows });
  } else if (initial !== rows.length) {
    throw new Error(`Expected ${rows.length} parcel record(s), found ${initial}. Reopen the form.`);
  }
  let lastError;
  for (let attempt = 0; attempt < 15; attempt++) {
    if (!isCurrent()) return false;
    try {
      const count = Number(await form.getRepeatCount('serviced_parcels'));
      if (count !== rows.length) throw new Error(`Expected ${rows.length} parcel record(s), found ${count}.`);
      verifyRepeatValues(await form.getQuestionValue(), expected);
      return isCurrent();
    } catch (error) { lastError = error; }
    if (attempt < 14) await pause();
  }
  throw lastError;
}
