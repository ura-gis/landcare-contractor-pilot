import {confirmPreviouslyReported} from './repeat-warning.js';
import { waitForWorkspaceTab,loadMapModules,withTimeout,fetchWithTimeout } from "./loading.js";
import { confirmReportChange, clearReportGuard } from './report-guard.js?v=20261027-latest1';
import { parcelSymbol, labelSymbol, declutterMapLabels } from "./map-design.js?v=20261027-latest1";
import {readParcelFilters,matchesParcelFilters,STATUS_LABELS} from "./parcel-filters.js";
import { assignmentType,matchesAssignmentType } from "./assignment-type.js";
import { parcelBlockLot } from "./parcel-label.js";
import { ParcelSelection } from "./parcel-selection.js";
import { currentPeriodLabel, previousPeriodLabel, assignmentPeriodLabel } from "./service-period.js";
import { buildPilotSurveyUrl } from "./pilot-survey-url.js";
import { openPilotRepeatForm } from "./pilot-repeat-form.js?v=20261027-latest1";
import {
  ASSIGNMENT_HISTORY_LAYER_URL,
  SURVEY123_PREFILL_FIELDS,
  SURVEY123_SHARE_URL
} from "./survey-submission-config.js";

let Map,MapView,Graphic,addFindMyLocation;
const container = document.getElementById("surveyEmbed");
const link = document.getElementById("openSurveyLink");
const lookupForm = document.getElementById("assignmentLookupForm");
const monthSelect = document.getElementById("assignmentMonth");
const organizationSelect = document.getElementById("assignmentOrganization");
const parcelSelect = document.getElementById("assignmentParcel");
const continueButton = document.getElementById("continueToSurvey");
const status = document.getElementById("assignmentLookupStatus");
const parcelMapNode = document.getElementById("assignmentParcelMap");
const selectedParcelLabel = document.getElementById("selectedParcelLabel");
const selectedParcelBadge = document.getElementById("selectedParcelBadge");
const selectedParcelMeta = document.getElementById("selectedParcelMeta");
const selection = new ParcelSelection();
const selectionList = document.getElementById('pilotSelectedParcels');
const selectionCount = document.getElementById('pilotSelectionCount');
const clearSelectionButton = document.getElementById('pilotClearSelection');
const selectionHelp = document.getElementById('pilotSelectionHelp');
let formVersion = 0;
let referenceSubmittedIds = new Set();
let pilotStatuses = null;
document.addEventListener('landcare:pilot-report-status', event => {
  const detail=event.detail;
  if(detail.period!==monthSelect.value || detail.organization!==cleanOrganization(organizationSelect.value)) return;
  pilotStatuses=detail.statuses;
  document.getElementById('pilotMapSource').textContent=pilotStatuses ? 'Map source: pilot reports (unreviewed)' : 'Pilot results unavailable — refresh pilot results';
  document.getElementById('pilotReferenceKey').hidden=true;
  document.getElementById('pilotFulfilledKey').hidden=!pilotStatuses;
  document.getElementById('pilotFollowUpKey').hidden=!pilotStatuses;
  renderSelection();
});
document.addEventListener('landcare:reference-progress', event => {
  const detail = event.detail || {};
  if (detail.period !== monthSelect.value || detail.organization !== cleanOrganization(organizationSelect.value)) return;
  referenceSubmittedIds = new Set(detail.submittedIds || []);
  renderSelection();
});

function invalidatePilotForm() {
  clearReportGuard();
  document.body.classList.remove("report-open");
  formVersion++;
  link.hidden = true;
  link.removeAttribute('href');
  const note = document.createElement('p');
  note.textContent = 'Review your selected parcels before opening the pilot form.';
  container.replaceChildren(note);
}

function renderSelection() {
  const items = selection.values();
  selectionCount.textContent = `${items.length} parcel${items.length === 1 ? '' : 's'} selected`;
  document.getElementById('pilotRunningSelected').textContent = String(items.length);
  clearSelectionButton.disabled = !items.length;
  continueButton.disabled = !items.length;
  document.getElementById('pilotDockContinue').disabled=!items.length;
  document.getElementById('pilotDockLabel').textContent=`${items.length} parcel${items.length===1?'':'s'} selected`;
  document.getElementById('pilotDockPeriod').textContent=monthSelect.value ? assignmentPeriodLabel(monthSelect.value) : '';
  document.getElementById('selectionDock').hidden=!items.length || document.body.dataset.activeTab!=='submit';
  continueButton.textContent = `Open report for ${items.length || 'selected'} parcel${items.length === 1 ? '' : 's'}`;
  selectionHelp.textContent = items.length > 1
    ? 'The same answer and photos must cover every selected parcel. Use separate reports for different outcomes.'
    : 'Add more parcels or continue to review and report.';
  selectionList.replaceChildren(...items.map(item => {
    const row = document.createElement('li');
    row.append(document.createTextNode(`${parcelBlockLot(item.parcelNumber)} — ${item.address} · ${assignmentType(item)}`));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${parcelBlockLot(item.parcelNumber)}`);
    remove.addEventListener('click', async () => {
      if (!await confirmReportChange()) return;
      selection.remove(item.objectId);
      if (parcelSelect.value === item.objectId) parcelSelect.value = '';
      invalidatePilotForm();
      renderSelection();
    });
    row.append(remove);
    return row;
  }));
  // Keep every selected boundary highlighted, rather than only the last parcel.
  availableParcelGraphics.filter(g => !g.attributes?.parcelLabel).forEach(g => {
    const selected = selection.has(g.attributes.assignmentObjectId);
    const id=String(g.attributes.assignmentObjectId);
    const submitted = pilotStatuses ? pilotStatuses[id]==='fulfilled' : referenceSubmittedIds.has(id);
    const followUp=pilotStatuses?.[id]==='follow-up';
    g.symbol=parcelSymbol(submitted?'fulfilled':followUp?'follow-up':pilotStatuses?'unreported':'unknown',selected,assignmentType(g.attributes.maintenanceLevel)==='Request Only');
  });
  if (selectedParcelGraphic) parcelMapView?.graphics.remove(selectedParcelGraphic);
  if (selectedParcelLabelGraphic) parcelMapView?.graphics.remove(selectedParcelLabelGraphic);
  selectedParcelGraphic = null;
  selectedParcelLabelGraphic = null;
  applyAssignmentScope();
  syncAvailableParcelLabels();
}

function resetSelection() {
  selection.clear();
  selectedAssignment = null;
  selectedParcelLabel.textContent='Tap parcels on the map or add them from the list';
  selectedParcelBadge.hidden=true;
  selectedParcelMeta.textContent='Blue outlines mark the parcels selected for this report.';
  invalidatePilotForm();
  renderSelection();
}
clearSelectionButton.addEventListener('click', async () => {
  if (!await confirmReportChange()) return;
  resetSelection();
  parcelSelect.value = '';
  syncContractorUrl();
});

let assignments = [];
let parcelLoadVersion = 0;
let parcelMapView;
let selectedParcelGraphic;
let selectedParcelLabelGraphic;
let availableParcelGraphics = [];
let selectedAssignment;
const isContractorPortal = document.body?.dataset?.page === "contractor";
const portalParams = new URLSearchParams(window.location.search);
const requestedMonth = portalParams.get("month") || "";
const requestedOrganization = portalParams.get("organization") || "";

function emitContractorContext() {
  if (!isContractorPortal) return;
  document.dispatchEvent(new CustomEvent("landcare:contractor-context", {
    detail: {
      month: monthSelect.value || "",
      organization: cleanOrganization(organizationSelect.value),
      rawOrganization: organizationSelect.value || "",
      parcel: parcelSelect.value || "",
      assignment: selectedAssignment || null
    }
  }));
}

function syncContractorUrl() {
  if (!isContractorPortal) return;
  const url = new URL(window.location.href);
  if (monthSelect.value) url.searchParams.set("month", monthSelect.value);
  else url.searchParams.delete("month");
  if (organizationSelect.value) url.searchParams.set("organization", cleanOrganization(organizationSelect.value));
  else url.searchParams.delete("organization");
  if (parcelSelect.value) url.searchParams.set("parcel", parcelSelect.value);
  else url.searchParams.delete("parcel");
  history.replaceState({}, "", url);
}

function isSurvey123Url(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)survey123\.arcgis\.com$/i.test(url.hostname) && /\/share\//.test(url.pathname);
  } catch {
    return false;
  }
}

function escapeSqlText(value) {
  return String(value || "").replace(/'/g, "''");
}

function cleanOrganization(value) {
  return String(value || "").replace(/\s+Primary Contact$/i, "").trim();
}

function periodWhere(extra = "1=1") {
  return `period_label = '${escapeSqlText(monthSelect.value)}' AND ${extra}`;
}

function coordinateFallback(geometry) {
  const center = polygonCenter(geometry);
  const latitude = center?.[1];
  const longitude = center?.[0];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "Location not listed";
  return `Coordinates ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
}

function normalizeAssignmentGeometry(geometry) {
  if (!geometry?.rings) return geometry || null;
  // A few historical bundle rows encode ring vertices as "longitude latitude"
  // strings. ArcGIS MapView cannot draw those directly, even though the parcel
  // boundary is present in the assignment service.
  const rings = geometry.rings.map((ring) => ring.map((point) => {
    if (!Array.isArray(point)) return String(point || "").trim().split(/\s+/).map(Number);
    return point.map(Number);
  }));
  const valid = rings.every((ring) => ring.every((point) => (
    point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
  )));
  // REST query geometry omits the `type` and often spatial reference. Supply
  // both so ArcGIS can construct an extent and render the selected boundary.
  return valid
    ? { type: "polygon", spatialReference: { wkid: 4326 }, ...geometry, rings }
    : null;
}

function polygonCenter(geometry) {
  const points = geometry?.rings?.flat?.(1) || [];
  const coordinates = points.filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
  if (!coordinates.length) return null;
  const xs = coordinates.map((point) => Number(point[0]));
  const ys = coordinates.map((point) => Number(point[1]));
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function parcelLabelGraphic(assignment) {
  const center=polygonCenter(assignment.geometry);
  return center ? new Graphic({geometry:{type:'point',longitude:center[0],latitude:center[1],spatialReference:{wkid:4326}},
    attributes:{assignmentObjectId:assignment.objectId,parcelLabel:true,maintenanceLevel:assignmentType(assignment)},symbol:labelSymbol(parcelBlockLot(assignment.parcelNumber)),visible:false}) : null;
}

function syncAvailableParcelLabels() {
  declutterMapLabels(parcelMapView,availableParcelGraphics.filter(g=>assignmentMatchesFilters(assignments.find(a=>a.objectId===String(g.attributes.assignmentObjectId)))),{focusedId:selection.has(selectedAssignment?.objectId)?selectedAssignment.objectId:'',selectedIds:new Set(selection.values().map(item=>String(item.objectId)))});
}

function setOptions(select, options, placeholder) {
  select.replaceChildren(new Option(placeholder, ""), ...options.map(({ label, value }) => new Option(label, value)));
}

async function fetchJson(url, params) {
  const request = new URL(url);
  Object.entries(params).forEach(([key, value]) => request.searchParams.set(key, value));
  const response = await fetchWithTimeout(request);
  if (!response.ok) throw new Error(`Assignment service returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "Assignment service is unavailable");
  return payload;
}

async function initializeParcelMap() {
  await waitForWorkspaceTab("submit");
  const modules=await loadMapModules();
  [Map,MapView,Graphic]=modules.slice(0,3).map(module=>module.default);
  addFindMyLocation=modules[6].addFindMyLocation;
  parcelMapView = new MapView({
    container: parcelMapNode,
    map: new Map({ basemap: "gray-vector" }),
    center: [-80.0, 40.44],
    zoom: 11,
    ui: { components: ["zoom"] }
  });
  await withTimeout(parcelMapView.when(),"The parcel map");
  addFindMyLocation(parcelMapView);
  parcelMapView.watch("stationary",syncAvailableParcelLabels);
  parcelMapView.watch("size",syncAvailableParcelLabels);
  parcelMapView.on("click", async (event) => {
    const hit = await parcelMapView.hitTest(event).catch(() => null);
    const graphic = hit?.results
      .map((result) => result.graphic)
      .find((item) => item?.attributes?.assignmentObjectId);
    if (graphic?.attributes?.assignmentObjectId) selectAssignment(graphic.attributes.assignmentObjectId, { fromMap: true });
  });
  const focused = selectedAssignment;
  showAvailableParcels();
  if (focused) showSelectedParcel(focused);
  renderSelection();
}

function clearAvailableParcels() {
  if (!parcelMapView) return;
  availableParcelGraphics.forEach((graphic) => parcelMapView.graphics.remove(graphic));
  availableParcelGraphics = [];
}

function showAvailableParcels() {
  clearAvailableParcels();
  if (!parcelMapView) return;
  if (selectedParcelGraphic) parcelMapView.graphics.remove(selectedParcelGraphic);
  if (selectedParcelLabelGraphic) parcelMapView.graphics.remove(selectedParcelLabelGraphic);
  selectedParcelGraphic = null;
  selectedParcelLabelGraphic = null;
  selectedAssignment = null;
  availableParcelGraphics = assignments
    .filter((assignment) => assignment.geometry)
    .flatMap((assignment) => {
      const parcel = new Graphic({
        geometry: assignment.geometry,
        attributes: { assignmentObjectId: assignment.objectId,maintenanceLevel:assignmentType(assignment) },
        symbol: {
          type: "simple-fill",
          color: [0, 152, 211, 0.08],
          outline: { color: "#007eae", width: 1.5 }
        }
      });
      const label = parcelLabelGraphic(assignment);
      return label ? [parcel, label] : [parcel];
    });
  availableParcelGraphics.forEach((graphic) => parcelMapView.graphics.add(graphic));
  renderSelection();
  if (!availableParcelGraphics.length) return;
  selectedParcelLabel.textContent = "Tap an outlined parcel on the map or use the list";
  selectedParcelBadge.hidden = true;
  selectedParcelMeta.textContent = "Solid outlines are Active; dashed outlines are Request Only. Report Request Only service only after the team asks you to.";
  parcelMapView.goTo(availableParcelGraphics.filter(g=>!g.attributes?.parcelLabel), { padding:40,duration:450 }).catch(() => {});
  applyAssignmentScope();
  syncAvailableParcelLabels();
}

function showSelectedParcel(assignment, {zoom=true}={}) {
  selectedAssignment = assignment;
  if (!parcelMapView || !assignment?.geometry) return;
  if (selectedParcelGraphic) parcelMapView.graphics.remove(selectedParcelGraphic);
  if (selectedParcelLabelGraphic) parcelMapView.graphics.remove(selectedParcelLabelGraphic);
  selectedParcelGraphic = new Graphic({
    geometry: assignment.geometry,
    symbol: {
      type: "simple-fill",
      color: [0, 152, 211, 0.34],
      outline: { color: "#006c9f", width: 4 }
    }
  });
  selectedParcelLabelGraphic = parcelLabelGraphic(assignment, { selected: true });
  parcelMapView.graphics.add(selectedParcelGraphic);
  if (selectedParcelLabelGraphic?.geometry) parcelMapView.graphics.add(selectedParcelLabelGraphic);
  syncAvailableParcelLabels();
  if(zoom) parcelMapView.goTo(assignment.geometry.extent?.expand(1.55) || selectedParcelGraphic, { duration: 450 }).catch(() => {});
  selectedParcelLabel.textContent = `${parcelBlockLot(assignment.parcelNumber)} · ${assignment.address}`;
  selectedParcelBadge.hidden = false;
  selectedParcelBadge.textContent = `Selected parcel · ${parcelBlockLot(assignment.parcelNumber)}`;
  selectedParcelMeta.textContent = `Bright blue boundary = this service record. ${assignment.address} · ${cleanOrganization(assignment.organization)} · ${assignmentPeriodLabel(assignment.period)}`;
}

async function selectAssignment(objectId, { fromMap = false } = {}) {
  const assignment = assignments.find((item) => item.objectId === String(objectId));
  if (!assignment) return;
  if (!await confirmReportChange()) {parcelSelect.value=selectedAssignment?.objectId || "";return;}
  selectedAssignment=assignment;
  parcelSelect.value = assignment.objectId;
  if (fromMap && selection.has(assignment.objectId)) selection.remove(assignment.objectId);
  else selection.add(assignment);
  invalidatePilotForm();
  status.textContent = `${parcelBlockLot(assignment.parcelNumber)} · ${assignment.address} · ${assignment.period} · ${assignmentType(assignment)}${fromMap ? " (selected on map)" : ""}`;
  showSelectedParcel(assignment,{zoom:!fromMap});
  renderSelection();
  syncContractorUrl();
  emitContractorContext();
}

async function loadRecentMonths() {
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: `period_label IN ('${currentPeriodLabel()}','${previousPeriodLabel(currentPeriodLabel())}')`,
    outFields: "period_label",
    returnGeometry: "false",
    returnDistinctValues: "true",
    orderByFields: "period_label DESC"
  });
  const published = new Set((payload.features || []).map(({ attributes }) => attributes?.period_label).filter(Boolean));
  const current = currentPeriodLabel();
  const months = [current, previousPeriodLabel(current)];
  setOptions(monthSelect, months.map((month) => ({
    value: month,
    label: `${assignmentPeriodLabel(month)}${published.has(month) ? '' : ' — assignments not available'}`
  })), "Choose assignment month");
  for (const option of monthSelect.options) option.disabled = !option.value || !published.has(option.value);
  const available = months.filter((month) => published.has(month));
  if (!available.length) throw new Error('Current and previous period assignments are not available yet.');
  monthSelect.value = available.includes(requestedMonth) ? requestedMonth : available[0];
  confirmedMonth=monthSelect.value;
  updatePeriodNotice();
  monthSelect.disabled = false;
}

function updatePeriodNotice() {
  let notice=document.getElementById('periodNotice');
  if(!notice) {
    notice=document.createElement('div');notice.id='periodNotice';notice.className='period-notice';
    monthSelect.closest('section').append(notice);
  }
  const previous=monthSelect.value!==currentPeriodLabel();
  const range=assignmentPeriodLabel(monthSelect.value);
  notice.innerHTML='';
  const fullRange=document.createElement('p');fullRange.textContent=range.split(': ')[1];fullRange.className='period-range';
  const deadline=document.createElement('p');
  deadline.className=previous ? 'late-period-notice' : 'period-deadline';
  deadline.textContent=previous ? `Late report: this will count toward ${range}. Your actual submission time is recorded.` : `Submit the same day, by ${range.split(' – ')[1]} at 11:59 p.m. Eastern.`;
  const rules=document.createElement('details');
  const summary=document.createElement('summary');summary.textContent='How service periods work';
  const text=document.createElement('p');text.textContent='Periods run from the 15th through the 14th, Eastern time. Submit immediately after work, preferably the same day. If you miss the deadline, choose Previous period. Your report counts toward that selected period; your actual submission timestamp is preserved. Periods without published assignments cannot be selected.';
  rules.append(summary,text);notice.append(fullRange,deadline,rules);
}

async function loadOrganizations() {
  const requestedPeriod=monthSelect.value;
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: periodWhere("maintained_by IS NOT NULL"),
    outFields: "maintained_by",
    returnGeometry: "false",
    returnDistinctValues: "true",
    orderByFields: "maintained_by ASC"
  });
  if(requestedPeriod!==monthSelect.value) return false;
  const organizations = [...new Set((payload.features || []).map(({ attributes }) => attributes?.maintained_by).filter(Boolean))]
    .map((value) => ({ label: cleanOrganization(value), value }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!organizations.length) throw new Error("No organization assignments were returned for this month");
  setOptions(organizationSelect, organizations, "Choose your organization");
  confirmedOrganization='';
  organizationSelect.disabled = false;
  status.textContent = `${organizations.length} organizations in the ${monthSelect.value} assignment bundle.`;
  emitContractorContext();
}

async function loadParcels(organization) {
  const version = ++parcelLoadVersion;
  const requestedPeriod = monthSelect.value;
  resetSelection();
  assignments=[];
  clearAvailableParcels();
  applyAssignmentScope();
  emitContractorContext();
  parcelSelect.disabled = true;
  continueButton.disabled = true;
  setOptions(parcelSelect, [], "Loading assigned parcels...");
  status.textContent = "Loading parcels assigned to this organization...";
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: periodWhere(`maintained_by = '${escapeSqlText(organization)}'`),
    outFields: "OBJECTID,parcelnumb,alco_pin,address,period_label,service_period_label,maintain_level,maintained_by",
    returnGeometry: "true",
    outSR: "4326",
    orderByFields: "address ASC, parcelnumb ASC",
    resultRecordCount: "2000"
  });
  if (version !== parcelLoadVersion || requestedPeriod !== monthSelect.value || organization !== organizationSelect.value) return;
  assignments = (payload.features || [])
    .map(({ attributes, geometry }) => {
      const parcelGeometry = normalizeAssignmentGeometry(geometry);
      return {
      objectId: String(attributes.OBJECTID),
      assignmentId: String(attributes.assignment_id ?? attributes.OBJECTID),
      address: attributes.address || coordinateFallback(parcelGeometry),
      coordinateLabel: coordinateFallback(parcelGeometry),
      organization: attributes.maintained_by || organization,
      parcelNumber: attributes.parcelnumb || attributes.alco_pin || "Parcel not listed",
      period: attributes.period_label || attributes.service_period_label || monthSelect.value,
      maintenanceLevel: attributes.maintain_level || "Active",
      geometry: parcelGeometry
    };
    })
    .filter((assignment) => /active|request/i.test(assignment.maintenanceLevel));
  setOptions(parcelSelect, assignments.map((assignment) => ({
    value: assignment.objectId,
    label: `${parcelBlockLot(assignment.parcelNumber)} - ${assignment.address} · ${assignmentType(assignment)}`
  })), assignments.length ? "Choose an assigned parcel" : "No parcels assigned");
  parcelSelect.disabled = assignments.length === 0;
  confirmedOrganization=organizationSelect.value;
  showAvailableParcels();
  document.dispatchEvent(new CustomEvent('landcare:pilot-assignments', {detail:{period:monthSelect.value,organization:cleanOrganization(organization),assignments}}));
  status.textContent = assignments.length
    ? `${assignments.filter(a=>assignmentType(a)==='Active').length} Active · ${assignments.filter(a=>assignmentType(a)==='Request Only').length} Request Only parcels. Choose from the map or the list.`
    : "No parcels were found for this organization in the selected assignment month.";
  syncContractorUrl();
  emitContractorContext();
}

const buildSurveyUrl = buildPilotSurveyUrl;

let confirmedMonth="",confirmedOrganization="";
monthSelect.addEventListener("change", async () => {
  if (!await confirmReportChange()) {monthSelect.value=confirmedMonth;return;}
  const previousOrganization=organizationSelect.value;
  const changingTo=monthSelect.value;
  confirmedMonth=monthSelect.value;
  updatePeriodNotice();
  pilotStatuses=null;
  referenceSubmittedIds.clear();
  parcelLoadVersion++;
  resetSelection();
  assignments = [];
  clearAvailableParcels();
  organizationSelect.disabled = true;
  organizationSelect.value='';
  emitContractorContext();
  applyAssignmentScope();
  parcelSelect.disabled = true;
  continueButton.disabled = true;
  setOptions(parcelSelect, [], "Choose an organization first");
  status.textContent = `Loading organizations for ${monthSelect.value}...`;
  try {
    const loaded=await loadOrganizations();
    if(loaded===false||changingTo!==monthSelect.value) return;
    const matching=[...organizationSelect.options].find(option=>option.value===previousOrganization);
    if(matching) {organizationSelect.value=matching.value;await loadParcels(matching.value);}
    syncContractorUrl();
  } catch (error) {
    if(changingTo!==monthSelect.value) return;
    status.textContent = `Unable to load organizations: ${error.message}`;
  }
});

organizationSelect.addEventListener("change", async () => {
  if (!await confirmReportChange()) {organizationSelect.value=confirmedOrganization;return;}
  confirmedOrganization=organizationSelect.value;
  pilotStatuses=null;
  referenceSubmittedIds.clear();
  parcelLoadVersion++;
  resetSelection();
  if (!organizationSelect.value) {
    assignments = [];
    clearAvailableParcels();
    setOptions(parcelSelect, [], "Choose an organization first");
    parcelSelect.disabled = true;
    continueButton.disabled = true;
    syncContractorUrl();
    emitContractorContext();
    return;
  }
  const requestedOrganization=organizationSelect.value, requestedPeriod=monthSelect.value;
  try {
    await loadParcels(requestedOrganization);
  } catch (error) {
    if(requestedOrganization!==organizationSelect.value||requestedPeriod!==monthSelect.value) return;
    assignments = [];
    setOptions(parcelSelect, [], "Unable to load parcels");
    status.textContent = `Unable to load assigned parcels: ${error.message}`;
  }
});

parcelSelect.addEventListener("change", () => {
  if (!parcelSelect.value) {
    renderSelection();
    return;
  }
  selectAssignment(parcelSelect.value);
});

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selection.size) return;
  const selectionKey=JSON.stringify(selection.values().map(a=>[a.objectId,a.period,a.organization]));
  if(!await confirmPreviouslyReported(selection.values(),pilotStatuses)) return;
  if(selectionKey!==JSON.stringify(selection.values().map(a=>[a.objectId,a.period,a.organization]))) return;
  if(!await confirmReportChange()) return;
  invalidatePilotForm();
  document.body.classList.add("report-open");
  const version = formVersion;
  const chosen = selection.values().map(item => ({...item}));
  status.textContent = `Opening the pilot report for ${chosen.length} parcel(s).`;
  try {
    await openPilotRepeatForm(container, chosen, () => version === formVersion);
    if (version === formVersion) container.scrollIntoView({behavior:'smooth',block:'start'});
  } catch (error) {
    document.body.classList.remove("report-open");
    if (version === formVersion) {
      status.textContent = `Pilot form could not open: ${error.message}`;
      container.textContent = 'No report was submitted. Keep this selection and retry opening the pilot form.';
    }
  }
});
document.getElementById('reloadApp').addEventListener('click',async()=>{if(await confirmReportChange()) location.reload();});
document.getElementById('pilotDockContinue').addEventListener('click',()=>lookupForm.requestSubmit());
document.addEventListener('landcare:tab-changed',renderSelection);
document.addEventListener('landcare:report-more',()=>{
  resetSelection();parcelSelect.value='';syncContractorUrl();
  parcelMapNode.scrollIntoView({behavior:'smooth',block:'center'});
});
function assignmentMatchesFilters(item) {
  return !!item&&matchesParcelFilters({...item,status:pilotStatuses?.[item.objectId]||'unknown'},readParcelFilters());
}
function applyAssignmentScope() {
  const filters=readParcelFilters();
  const matching=assignments.filter(assignmentMatchesFilters);
  const ids=new Set(matching.map(a=>a.objectId));
  for(const option of parcelSelect.options) {
    const match=!option.value||ids.has(option.value);option.hidden=!match;option.disabled=!match||!option.value;
  }
  if(parcelSelect.value&&!ids.has(parcelSelect.value)) {parcelSelect.value='';syncContractorUrl();}
  for(const graphic of availableParcelGraphics) graphic.visible=ids.has(String(graphic.attributes.assignmentObjectId));
  const hidden=selection.values().filter(item=>!ids.has(item.objectId)).length;
  const summary=document.getElementById('parcelFilterSummary');
  summary.textContent=organizationSelect.value ? `Showing ${matching.length} of ${assignments.length} parcels · ${filters.type==='all'?'Active + Request Only':filters.type==='request'?'Request Only':'Active'} · ${STATUS_LABELS[filters.status]}${filters.query?` · Search: ${filters.query}`:''}${!pilotStatuses&&filters.status!=='all'?' · Report status unavailable; refresh progress or choose All statuses.':''}` : 'Choose an organization to see matching parcels.';
  document.getElementById('parcelSearchResult').textContent=matching.length ? `${matching.length} parcels match the filters in the map and list.` : assignments.length ? 'No parcels match. Use Clear filters to see all assigned parcels.' : '';
  if(hidden) selectionHelp.textContent=`${hidden} selected parcel${hidden===1?' is':'s are'} hidden by the filters but still included in your report. Review the selection before continuing.`;
}
document.addEventListener('landcare:filters-changed',()=>{
  renderSelection();
  const graphics=availableParcelGraphics.filter(g=>!g.attributes?.parcelLabel&&g.visible);
  if(graphics.length) parcelMapView?.goTo(graphics,{duration:300}).catch(()=>{});
});
loadRecentMonths()
  .then(async () => {
    await loadOrganizations();
    if (isContractorPortal && requestedOrganization) {
      const requested = cleanOrganization(requestedOrganization).toLowerCase();
      const matchingOption = [...organizationSelect.options].find((option) => (
        cleanOrganization(option.value).toLowerCase() === requested
      ));
      if (matchingOption) {
        organizationSelect.value = matchingOption.value;
        await loadParcels(organizationSelect.value);
        const requestedParcel = portalParams.get("parcel");
        if (requestedParcel && assignments.some((assignment) => assignment.objectId === requestedParcel)) {
          selectAssignment(requestedParcel);
        }
      }
    }
    syncContractorUrl();
    emitContractorContext();
  })
  .catch((error) => {
    organizationSelect.disabled = true;
    monthSelect.disabled = true;
    status.textContent = `Unable to load the assignment bundle: ${error.message}`;
  });

initializeParcelMap().catch((error) => {
  selectedParcelMeta.textContent = `${error.message} You can still select parcels from the list and report service.`;
  parcelMapNode.textContent="Map unavailable. Use the parcel list above, or Reload app to retry.";
});














