import { withTimeout } from './loading.js?v=20261027-latest2';
import { buildRepeatQuestionValues, verifyRepeatValues } from './pilot-repeat-data.js?v=20261027-latest2';
import { initializeRepeat } from './pilot-repeat-initialize.js?v=20261027-latest2';
import { assignmentType } from './assignment-type.js?v=20261027-latest2';
import { parcelBlockLot } from './parcel-label.js?v=20261027-latest2';
import { assignmentPeriodLabel } from './service-period.js?v=20261027-latest2';
import { setReportDirty, setReportPending, clearReportGuard } from './report-guard.js?v=20261027-latest2';

let sdkPromise;
async function loadSurveySdk() {
  if(window.Survey123WebForm) return Promise.resolve(window.Survey123WebForm);
  if(!sdkPromise) sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://survey123.arcgis.com/api/jsapi/';
    script.onload=()=>window.Survey123WebForm ? resolve(window.Survey123WebForm) : reject(new Error('Survey123 did not initialize.'));
    script.onerror=()=>{sdkPromise=null;reject(new Error('Unable to load Survey123. Check your connection and try again.'));};
    document.head.append(script);
  });
  try {return await withTimeout(sdkPromise,'The survey form');} catch(error) {sdkPromise=null;throw error;}
}

export async function openPilotRepeatForm(container,assignments,isCurrent) {
  const questionValue=buildRepeatQuestionValues(assignments);
  const {serviced_parcels:childRows,...parentValues}=questionValue;
  const Sdk=await loadSurveySdk();if(!isCurrent()) return;
  const summary=document.createElement('section');summary.className='report-context-summary';
  const heading=document.createElement('h3');heading.textContent=`Report for ${assignments.length} parcel${assignments.length===1?'':'s'}`;
  const context=document.createElement('p');context.textContent=`${assignments[0].organization} · ${assignmentPeriodLabel(assignments[0].period)}`;
  const parcels=document.createElement('details'),toggle=document.createElement('summary'),list=document.createElement('ul');
  toggle.textContent=`Review selected parcels (${assignments.length})`;
  for(const item of assignments) {const li=document.createElement('li');li.textContent=`${parcelBlockLot(item.parcelNumber)} · ${item.address} · ${assignmentType(item)}`;list.append(li);}
  parcels.append(toggle,list);
  const guidance=document.createElement('p');guidance.className='report-guidance';
  guidance.textContent='Report Request Only parcels only after the LandCare team asks you to service them. Yes is selected by default; choose No if obligations were not fulfilled. The answer and photos cover every selected parcel. For No, explain what prevented completion in Comments and photograph the current conditions. For Yes, photograph the completed work. Use separate reports for different outcomes.';
  summary.append(heading,context,parcels,guidance);
  const host=document.createElement('div');host.id=`pilot-repeat-${crypto.randomUUID()}`;host.className='pilot-form-host';
  const message=document.createElement('p');message.className='report-feedback';message.setAttribute('role','status');message.textContent='Preparing your service report…';
  const submit=document.createElement('button');submit.className='report-submit';submit.type='button';
  const submitLabel=`Submit report for ${assignments.length} parcel${assignments.length===1?'':'s'}`;
  submit.textContent=submitLabel;submit.disabled=true;
  const more=document.createElement('button');more.type='button';more.className='report-more';more.textContent='Report more parcels';more.hidden=true;
  more.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('landcare:report-more')));
  const check=document.createElement('button');check.type='button';check.className='report-more';check.hidden=true;check.textContent='Refresh progress to check for this report';
  const retry=document.createElement('button');retry.type='button';retry.className='report-more';retry.hidden=true;retry.textContent='Review and retry';
  check.addEventListener('click',()=>{document.dispatchEvent(new CustomEvent('landcare:pilot-submitted'));retry.hidden=false;});
  retry.addEventListener('click',()=>{
    if(!isCurrent()||completed) return;
    if(!window.confirm('Check the parcel report history first. If this report was saved, retrying will create another report. Have you checked that it was not saved?')) return;
    pending=false;setReportPending(false);submit.disabled=false;submit.textContent=submitLabel;retry.hidden=true;check.hidden=true;
    message.textContent='Your answers are preserved. Check the form, then submit when ready.';
  });
  container.replaceChildren(summary,message,host,submit,more,check,retry);
  let form,completed=false,ready=false,pending=false,initialization,waiting;
  const loadingTimer=setTimeout(()=>{
    if(!ready&&isCurrent()) {message.textContent='The survey is taking too long to load. Your parcel selection is preserved. Reopen the report or use Reload app to retry.';document.body?.classList.remove('report-open');}
  },30000);
  const resize=data=>{
    if(!isCurrent()||completed) return;
    const height=Number(data?.contentHeight ?? data?.height);
    if(Number.isFinite(height)&&height>0) {
      const pixels=Math.ceil(height)+24;host.style.height=`${pixels}px`;
      const frame=host.querySelector('iframe');if(frame) {frame.style.height=`${pixels}px`;frame.style.minHeight='0';}
    }
  };
  const checkSelection=async()=>{
    if(!isCurrent()||completed) throw new Error('This report is no longer active. Reopen it for your current selection.');
    if(Number(await form.getRepeatCount('serviced_parcels'))!==assignments.length) throw new Error('The selected parcels could not be confirmed. Reopen the report.');
    verifyRepeatValues(await form.getQuestionValue(),questionValue);
  };
  form=new Sdk({
    container:host.id,itemId:'ff3dcbb91ccb4b8f8ff003216abc6540',questionValue:parentValues,
    hideElements:['navbar','header','description','footer','submit'],onFormResized:resize,
    onQuestionValueChanged:data=>{
      if(!ready||!isCurrent()||completed) return;
      // SDK versions may report question IDs rather than stored field names.
      // Any value change after initialization makes this an unfinished report.
      setReportDirty();
    },
    onFormLoaded:async data=>{
      try {
        initialization ??= (async()=>{
          if(!await initializeRepeat(form,questionValue,isCurrent)) return false;
          const initial=await form.getQuestionValue();
          if(!['Yes','No'].includes(initial.did_you_fulfill_your_obligation)) {
            form.setQuestionValue({did_you_fulfill_your_obligation:'Yes'});
          }
          return isCurrent();
        })();
        if(!await initialization) return;
        await checkSelection();if(!isCurrent()) return;
        // Presentation only: retain all stored context and related records.
        form.setStyle({
          '& .question.readonly':{display:'none !important'},
          '& section[name$="/serviced_parcels"]':{display:'none !important'},
          '& .form-body':{padding:'0 !important',boxShadow:'none !important'},
          '& .question':{padding:'16px !important',margin:'0 !important'},
          '& .question-label':{fontSize:'17px !important'}
        });
        form.setTheme({form:{backgroundColor:'#ffffff',primaryColor:'#007eae',primaryTextColor:'#ffffff',textColor:'#183b50'},webpage:{backgroundColor:'#ffffff'}});
        clearTimeout(loadingTimer);resize(data);ready=true;setReportDirty();submit.disabled=false;message.textContent='Answer the question, add a photo, and submit.';
        // Protect an opened form conservatively: cross-origin value-change
        // messages can arrive after a quick click on another page control.
      } catch(error) {clearTimeout(loadingTimer);if(isCurrent()) {document.body?.classList.remove('report-open');message.textContent=`Report could not load: ${error.message} Reopen the report to retry.`;}}
    },
    onFormSubmit:()=>{if(!isCurrent()||completed) return;pending=true;setReportPending(true);submit.disabled=true;submit.textContent='Submitting…';message.textContent='Sending your report and photos. Please keep this page open.';},
    onFormSubmitted:()=>{
      if(!isCurrent()) return;
      completed=true;pending=false;clearTimeout(waiting);clearReportGuard();
      submit.disabled=true;submit.hidden=true;host.hidden=true;more.hidden=false;check.hidden=true;retry.hidden=true;
      message.classList.add('is-success');message.setAttribute('tabindex','-1');
      message.textContent=`Report received for ${assignments.length} parcel${assignments.length===1?'':'s'} · ${assignmentPeriodLabel(assignments[0].period)}. Progress is refreshing.`;
      message.focus();document.dispatchEvent(new CustomEvent('landcare:pilot-submitted'));
    }
  });
  submit.addEventListener('click',async()=>{
    if(pending||completed||!ready) return;
    pending=true;setReportPending(true);submit.disabled=true;submit.textContent='Checking report…';
    let sent=false;
    try {
      await checkSelection();await form.validateForm();
      const values=await form.getQuestionValue();
      if(!['Yes','No'].includes(values.did_you_fulfill_your_obligation)) throw new Error('Choose Yes or No before submitting.');
      const photo=values.photo_of_completed_work;
      if(!photo||photo==='0'||(Array.isArray(photo)&&!photo.length)) throw new Error('Add a photo before submitting.');
      if(!isCurrent()) return;
      submit.textContent='Submitting…';message.textContent='Sending your report and photos. Please keep this page open.';
      form.submitForm();sent=true;
      waiting=setTimeout(()=>{
        if(!isCurrent()||completed) return;
        message.textContent='Confirmation has not arrived yet. Check the form for an error and refresh progress before sending another report. Your answers are still here.';check.hidden=false;
      },45000);
    } catch(error) {if(isCurrent()) message.textContent=`Not submitted: ${error?.message||'Check the highlighted questions and try again.'}`;}
    finally {if(!sent&&isCurrent()&&!completed) {pending=false;setReportPending(false);submit.disabled=false;submit.textContent=submitLabel;}}
  });
}




