import { buildRepeatQuestionValues, verifyRepeatValues } from './pilot-repeat-data.js';
import { initializeRepeat } from './pilot-repeat-initialize.js';

let sdkPromise;
function loadSurveySdk() {
  if (window.Survey123WebForm) return Promise.resolve(window.Survey123WebForm);
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://survey123.arcgis.com/api/jsapi/';
    script.onload = () => window.Survey123WebForm ? resolve(window.Survey123WebForm) : reject(new Error('Survey123 API did not initialize.'));
    script.onerror = () => reject(new Error('Unable to load the Survey123 API.'));
    document.head.append(script);
  });
  return sdkPromise;
}

// Collection remains in Survey123: the API populates child repeats and the
// feature service creates parentglobalid relationships, never hand-built IDs.
export async function openPilotRepeatForm(container, assignments, isCurrent) {
  const questionValue = buildRepeatQuestionValues(assignments);
  const { serviced_parcels: childRows, ...parentValues } = questionValue;
  const Sdk = await loadSurveySdk();
  if (!isCurrent()) return;
  const host = document.createElement('div');
  host.id = `pilot-repeat-${crypto.randomUUID()}`;
  const message = document.createElement('p');
  message.setAttribute('role', 'status');
  message.textContent = `Loading ${assignments.length} related parcel record(s)…`;
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.textContent = `Submit pilot report for ${assignments.length} parcel(s)`;
  submit.disabled = true;
  container.replaceChildren(message, host, submit);
  let form;
  let completed = false;
  let initialization;
  const checkSelection = async () => {
    if (!isCurrent() || completed) throw new Error('This selection has changed or was already submitted. Reopen the form to report another visit.');
    const count = await form.getRepeatCount('serviced_parcels');
    if (Number(count) !== assignments.length) throw new Error(`Expected ${assignments.length} related parcel record(s), found ${count}. Do not submit this form.`);
    verifyRepeatValues(await form.getQuestionValue(), questionValue);
  };
  form = new Sdk({
    container: host.id,
    itemId: 'ff3dcbb91ccb4b8f8ff003216abc6540',
    questionValue: parentValues,
    hideElements: ['navbar', 'submit'],
    onFormLoaded: async () => {
      try {
        // Constructor-prefilled repeats occasionally remained empty for a
        // single parcel. Add child rows explicitly after form readiness.
        initialization ??= initializeRepeat(form, questionValue, isCurrent);
        const ready = await initialization;
        if (!ready) return;
        await checkSelection();
        if (!isCurrent()) return;
        submit.disabled = false;
        message.textContent = `${assignments.length} parcel records loaded and checked. Answer the fulfillment question, attach a photo, and submit using the button below.`;
      } catch (error) {
        if (isCurrent()) message.textContent = `Pilot form connection needs attention: ${error.message}`;
      }
    },
    onFormSubmitted: () => {
      completed = true;
      submit.disabled = true;
      message.textContent = 'Pilot submission received. Verify its parent record, related parcels, and photo in Survey123 Data. Production counts are unchanged.';
      document.dispatchEvent(new CustomEvent('landcare:pilot-submitted'));
    }
  });
  submit.addEventListener('click', async () => {
    submit.disabled = true;
    try {
      await checkSelection();
      form.submitForm(); // Survey123 validates required answers/photos.
      message.textContent = 'Check the form for validation messages. Confirm successful submission before trying again.';
    } catch (error) {
      message.textContent = `Not submitted: ${error.message}`;
    } finally {
      if (isCurrent() && !completed) submit.disabled = false;
    }
  });
}
