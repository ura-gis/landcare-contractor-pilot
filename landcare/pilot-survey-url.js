import { SURVEY123_SHARE_URL, SURVEY123_PREFILL_FIELDS, ASSIGNMENT_HISTORY_LAYER_URL } from './survey-submission-config.js?v=20261027-latest2';

export function buildPilotSurveyUrl(assignment) {
  const url = new URL(SURVEY123_SHARE_URL);
  if (url.pathname !== '/share/ff3dcbb91ccb4b8f8ff003216abc6540') {
    throw new Error('Only the isolated pilot survey is permitted.');
  }
  const reference = `${ASSIGNMENT_HISTORY_LAYER_URL}#objectid=${encodeURIComponent(assignment.objectId)}`;
  const context = {
    organization: String(assignment.organization || '').replace(/\s+Primary Contact$/i, '').trim(),
    parcelNumber: String(assignment.parcelNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    assignmentPeriod: assignment.period,
    assignmentObjectId: reference
  };
  for (const [key, value] of Object.entries(context)) {
    if (!value) throw new Error(`Missing parcel context: ${key}`);
    url.searchParams.set(`field:${SURVEY123_PREFILL_FIELDS[key]}`, value);
  }
  url.searchParams.set('field:did_you_fulfill_your_obligation','Yes');
  url.searchParams.set('embed', '1');
  url.searchParams.set('hideNav', '1');
  url.searchParams.set('autoFocus', '0');
  return url;
}
