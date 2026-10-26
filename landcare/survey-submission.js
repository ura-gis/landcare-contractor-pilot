import { parcelBlockLot } from "./parcel-label.js";
import { ParcelSelection } from "./parcel-selection.js";
import { currentPeriodLabel, previousPeriodLabel, assignmentPeriodLabel } from "./service-period.js";
import { addFindMyLocation } from "./map-location.js?v=20261015-visible";
import { buildPilotSurveyUrl } from "./pilot-survey-url.js";
import { openPilotRepeatForm } from "./pilot-repeat-form.js?v=20261026-results";
import {
  ASSIGNMENT_HISTORY_LAYER_URL,
  SURVEY123_PREFILL_FIELDS,
  SURVEY123_SHARE_URL
} from "./survey-submission-config.js";
import Map from "https://js.arcgis.com/4.30/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.30/@arcgis/core/views/MapView.js";
import Graphic from "https://js.arcgis.com/4.30/@arcgis/core/Graphic.js";

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
  continueButton.textContent = `Open report for ${items.length || 'selected'} parcel${items.length === 1 ? '' : 's'}`;
  selectionHelp.textContent = items.length > 1
    ? 'One fulfillment answer and photo apply to every selected parcel. The pilot form will include one related record per parcel.'
    : 'Select parcels from the map or list. The pilot form will check that every selected parcel has a related record.';
  selectionList.replaceChildren(...items.map(item => {
    const row = document.createElement('li');
    row.append(document.createTextNode(`${parcelBlockLot(item.parcelNumber)} — ${item.address}`));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${parcelBlockLot(item.parcelNumber)}`);
    remove.addEventListener('click', () => {
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
    g.symbol = {type:'simple-fill', color: selected ? [0,152,211,0.34] : submitted ? [46,125,50,0.76] : followUp ? [247,188,131,0.85] : [0,152,211,0.08], outline:{color:selected ? '#006c9f' : submitted ? '#1c5a29' : followUp ? '#c2410c' : '#007eae',width:selected ? 3 : 1.5}};
  });
  if (selectedParcelGraphic) parcelMapView?.graphics.remove(selectedParcelGraphic);
  if (selectedParcelLabelGraphic) parcelMapView?.graphics.remove(selectedParcelLabelGraphic);
  selectedParcelGraphic = null;
  selectedParcelLabelGraphic = null;
  syncAvailableParcelLabels();
}

function resetSelection() {
  selection.clear();
  selectedAssignment = null;
  invalidatePilotForm();
  renderSelection();
}
clearSelectionButton.addEventListener('click', () => {
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
const PARCEL_LABEL_SCALE = 5000;
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

function parcelLabelGraphic(assignment, { selected = false } = {}) {
  const center = polygonCenter(assignment.geometry);
  if (!center) return null;
  return new Graphic({
    geometry: { type: "point", longitude: center[0], latitude: center[1], spatialReference: { wkid: 4326 } },
    attributes: { assignmentObjectId: assignment.objectId, parcelLabel: true, selected },
    symbol: {
      type: "text",
      color: selected ? "#00334f" : "#17212b",
      haloColor: "#ffffff",
      haloSize: selected ? 1.7 : 1.35,
      // The selected boundary and confirmation card already communicate state.
      // Keep a single parcel number on the map rather than stacking a second
      // "SELECTED" label over the regular zoom label.
      text: parcelBlockLot(assignment.parcelNumber),
      font: { family: "Arial", size: selected ? 10 : 9, weight: "bold" },
      yoffset: selected ? 12 : 4
    }
  });
}

function syncAvailableParcelLabels() {
  if (!parcelMapView) return;
  const showLabels = parcelMapView.scale <= PARCEL_LABEL_SCALE;
  availableParcelGraphics.filter((graphic) => graphic.attributes?.parcelLabel)
    .forEach((graphic) => {
      // A selected parcel has its own persistent label. Hide its ordinary
      // zoom-level label so the two labels can never overlap.
      graphic.visible = selection.has(graphic.attributes.assignmentObjectId) || showLabels;
    });
}

function setOptions(select, options, placeholder) {
  select.replaceChildren(new Option(placeholder, ""), ...options.map(({ label, value }) => new Option(label, value)));
}

async function fetchJson(url, params) {
  const request = new URL(url);
  Object.entries(params).forEach(([key, value]) => request.searchParams.set(key, value));
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Assignment service returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "Assignment service is unavailable");
  return payload;
}

async function initializeParcelMap() {
  parcelMapView = new MapView({
    container: parcelMapNode,
    map: new Map({ basemap: "gray-vector" }),
    center: [-80.0, 40.44],
    zoom: 11,
    ui: { components: ["zoom"] }
  });
  await parcelMapView.when();
  addFindMyLocation(parcelMapView);
  parcelMapView.watch("scale", syncAvailableParcelLabels);
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
        attributes: { assignmentObjectId: assignment.objectId },
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
  selectedParcelMeta.textContent = "Every outline is assigned to the selected organization. Tap a parcel to select it for this service record.";
  parcelMapView.goTo(availableParcelGraphics, { duration: 450 }).catch(() => {});
  syncAvailableParcelLabels();
}

function showSelectedParcel(assignment) {
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
  parcelMapView.goTo(assignment.geometry.extent?.expand(1.55) || selectedParcelGraphic, { duration: 450 }).catch(() => {});
  selectedParcelLabel.textContent = `${assignment.parcelNumber} - ${assignment.address}`;
  selectedParcelBadge.hidden = false;
  selectedParcelBadge.textContent = `Selected parcel · ${assignment.parcelNumber}`;
  selectedParcelMeta.textContent = `Bright blue boundary = this service record. ${assignment.address} · ${cleanOrganization(assignment.organization)} · ${assignment.period} · ${assignment.coordinateLabel}`;
}

function selectAssignment(objectId, { fromMap = false } = {}) {
  const assignment = assignments.find((item) => item.objectId === String(objectId));
  if (!assignment) return;
  parcelSelect.value = assignment.objectId;
  if (fromMap && selection.has(assignment.objectId)) selection.remove(assignment.objectId);
  else selection.add(assignment);
  invalidatePilotForm();
  status.textContent = `${assignment.parcelNumber} - ${assignment.address} - ${assignment.period}${fromMap ? " (selected on map)" : ""}`;
  if (!fromMap) showSelectedParcel(assignment);
  renderSelection();
  syncContractorUrl();
  emitContractorContext();
}

async function loadRecentMonths() {
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: "period_label IS NOT NULL",
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
  const periodNotice = document.createElement('p');
  periodNotice.className = 'contractor-context__status';
  periodNotice.setAttribute('role', 'status');
  periodNotice.textContent = 'LandCare periods run from the 15th through the 14th of the next month, Eastern time. Submit immediately after work, preferably the same day and by the end of the 14th. Missed that deadline? Choose Previous period to report work for that period. Your actual submission time is still recorded. If a period has no published assignments, it cannot be selected yet.';
  monthSelect.closest('section').append(periodNotice);
  monthSelect.disabled = false;
}

async function loadOrganizations() {
  const payload = await fetchJson(`${ASSIGNMENT_HISTORY_LAYER_URL}/query`, {
    f: "json",
    where: periodWhere("maintained_by IS NOT NULL"),
    outFields: "maintained_by",
    returnGeometry: "false",
    returnDistinctValues: "true",
    orderByFields: "maintained_by ASC"
  });
  const organizations = [...new Set((payload.features || []).map(({ attributes }) => attributes?.maintained_by).filter(Boolean))]
    .map((value) => ({ label: cleanOrganization(value), value }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (!organizations.length) throw new Error("No organization assignments were returned for this month");
  setOptions(organizationSelect, organizations, "Choose your organization");
  organizationSelect.disabled = false;
  status.textContent = `${organizations.length} organizations in the ${monthSelect.value} assignment bundle.`;
  emitContractorContext();
}

async function loadParcels(organization) {
  const version = ++parcelLoadVersion;
  const requestedPeriod = monthSelect.value;
  resetSelection();
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
    .filter((assignment) => !/request/i.test(assignment.maintenanceLevel));
  setOptions(parcelSelect, assignments.map((assignment) => ({
    value: assignment.objectId,
    label: `${parcelBlockLot(assignment.parcelNumber)} - ${assignment.address}`
  })), assignments.length ? "Choose an assigned parcel" : "No active parcels assigned");
  parcelSelect.disabled = assignments.length === 0;
  showAvailableParcels();
  document.dispatchEvent(new CustomEvent('landcare:pilot-assignments', {detail:{period:monthSelect.value,organization:cleanOrganization(organization),assignments}}));
  status.textContent = assignments.length
    ? `${assignments.length} active parcel${assignments.length === 1 ? "" : "s"} assigned for ${monthSelect.value}. Choose from the map or the list.`
    : "No active parcels were found for this organization in the selected assignment month.";
  syncContractorUrl();
  emitContractorContext();
}

const buildSurveyUrl = buildPilotSurveyUrl;

monthSelect.addEventListener("change", async () => {
  pilotStatuses=null;
  referenceSubmittedIds.clear();
  parcelLoadVersion++;
  resetSelection();
  assignments = [];
  clearAvailableParcels();
  organizationSelect.disabled = true;
  parcelSelect.disabled = true;
  continueButton.disabled = true;
  setOptions(parcelSelect, [], "Choose an organization first");
  status.textContent = `Loading organizations for ${monthSelect.value}...`;
  try {
    await loadOrganizations();
    syncContractorUrl();
  } catch (error) {
    status.textContent = `Unable to load organizations: ${error.message}`;
  }
});

organizationSelect.addEventListener("change", async () => {
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
  try {
    await loadParcels(organizationSelect.value);
  } catch (error) {
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
  invalidatePilotForm();
  const version = formVersion;
  const chosen = selection.values().map(item => ({...item}));
  status.textContent = `Opening the pilot report for ${chosen.length} parcel(s).`;
  try {
    await openPilotRepeatForm(container, chosen, () => version === formVersion);
    if (version === formVersion) container.scrollIntoView({behavior:'smooth',block:'start'});
  } catch (error) {
    if (version === formVersion) {
      status.textContent = `Pilot form could not open: ${error.message}`;
      container.textContent = 'No report was submitted. Keep this selection and retry opening the pilot form.';
    }
  }
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

initializeParcelMap().catch(() => {
  selectedParcelMeta.textContent = "The parcel map could not load. The assignment lookup remains available.";
});







