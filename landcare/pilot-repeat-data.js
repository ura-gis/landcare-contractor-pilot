import { buildPilotSurveyUrl } from './pilot-survey-url.js?v=20261027-field3';
import { ParcelSelection } from './parcel-selection.js?v=20261027-field3';

export function buildRepeatQuestionValues(assignments) {
  const selection = new ParcelSelection();
  assignments.forEach(item => selection.add(item));
  if (!selection.size || selection.size !== assignments.length) throw new Error('Select distinct parcels from one organization and period.');
  const contexts = assignments.map(item => buildPilotSurveyUrl(item).searchParams);
  return {
    did_you_fulfill_your_obligation: 'Yes',
    organization: contexts[0].get('field:organization'),
    assignment_period: contexts[0].get('field:assignment_period'),
    // Legacy parent fields are used only for a one-parcel event.
    parcel_number: contexts.length === 1 ? contexts[0].get('field:parcel_number') : '',
    assignment_reference: contexts.length === 1 ? contexts[0].get('field:assignment_reference') : '',
    serviced_parcels: contexts.map(params => ({
      serviced_parcel_number: params.get('field:parcel_number'),
      serviced_assignment_reference: params.get('field:assignment_reference')
    }))
  };
}

export function verifyRepeatValues(actual, expected) {
  if (actual?.organization !== expected.organization || actual?.assignment_period !== expected.assignment_period) throw new Error('Form organization or period does not match the reviewed selection.');
  const rows = actual?.serviced_parcels;
  if (!Array.isArray(rows) || rows.length !== expected.serviced_parcels.length) throw new Error('Form parcel count does not match the reviewed selection.');
  const key = row => `${row.serviced_parcel_number}|${row.serviced_assignment_reference}`;
  const expectedKeys = new Set(expected.serviced_parcels.map(key));
  const actualKeys = new Set(rows.map(key));
  if (actualKeys.size !== rows.length || [...actualKeys].some(item => !expectedKeys.has(item))) throw new Error('Form parcel records differ from the reviewed selection.');
}
