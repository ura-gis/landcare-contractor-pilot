import { waitForWorkspaceTab,loadMapModules,withTimeout,fetchWithTimeout } from "./loading.js?v=20261027-field2";
import { parcelSymbol,labelSymbol,declutterMapLabels } from "./map-design.js?v=20261027-field2";
import {readParcelFilters,matchesParcelFilters,compareParcels,STATUS_LABELS} from "./parcel-filters.js?v=20261027-field2";
import { assignmentType,matchesAssignmentType } from "./assignment-type.js?v=20261027-field2";
import { fetchPilotReportPhotos } from './pilot-results-feed.js?v=20261027-field2';
import { pilotOverviewFeatures, pilotStatusLabel } from './pilot-overview-data.js?v=20261027-field2';
import { fetchAssignmentGeojsonForPeriod } from "./assignment-layer.js?v=20261027-field2";
import {
  cleanOrganization,
  fetchArcgisJson,
  fetchSurveyEvidenceForParcel,
  fetchSurveyRecordsForPeriod,
  loadSurvey123EvidenceByPeriod,
  parcelDigits,
  survey123EvidenceMatchesAssignment
} from "./survey-layer.js?v=20261027-field2";

let Map,MapView,Graphic,GraphicsLayer,BasemapToggle,Zoom,addFindMyLocation;
const monthSelect = document.getElementById("assignmentMonth");
const organizationSelect = document.getElementById("assignmentOrganization");
const parcelSelect = document.getElementById("assignmentParcel");
const mapNode = document.getElementById("contractorProgressMap");
const detailNode = document.getElementById("contractorParcelDetail");
const titleNode = document.getElementById("contractorOverviewTitle");
const freshnessNode = document.getElementById("contractorFreshness");
const assignedNode = document.getElementById("contractorAssignedKpi");
const submittedNode = document.getElementById("contractorSubmittedKpi");
const openNode = document.getElementById("contractorOpenKpi");
const rateNode = document.getElementById("contractorRate");
const rateValueNode = document.getElementById("contractorRateValue");
const rateBarNode = document.getElementById("contractorRateBar");
const mapCardNode = document.getElementById("contractorMapCard");
const listCardNode = document.getElementById("contractorListCard");
const listNode = document.getElementById("contractorParcelList");
const listSummaryNode = document.getElementById("contractorListSummary");
const listTitleNode = document.getElementById("contractorListTitle");

const EPP_PARCEL_LAYER_URL =
  "https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer/0";
const COUNCIL_DISTRICT_LAYER_URL =
  "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/CouncilDistricts2022/FeatureServer/0";
const state = {
  month: "",
  organization: "",
  selectedObjectId: "",
  map: null,
  view: null,
  layer: null,
  features: [],
  statusFilter: "all",
  overviewView: "map",
  listSort: { key: "block_lot", direction: "asc" },
  parcelReference: new globalThis.Map(),
  evidenceCache: new globalThis.Map(),
  survey123Evidence: [],
  councilDistricts: null
};
let pilotDetail = null;
let overviewVersion = 0;
let detailVersion = 0;

function updatePilotMetrics() {
  const result=pilotDetail?.result;
  assignedNode.textContent=formatNumber(result ? result.assigned : state.features.filter(f=>assignmentType(f.properties)==='Active').length);
  const requested=result?.requestOnly;
  document.getElementById('requestOnlyCounts').textContent=requested ? `${requested.assigned} parcels · ${requested.reported} reported · ${requested.fulfilled} reported fulfilled · ${requested.followUp} needs follow-up` : 'Reports unavailable.';
  submittedNode.textContent=result ? formatNumber(result.fulfilled) : '--';
  openNode.textContent=result ? formatNumber(result.followUp) : '--';
  document.getElementById('contractorUnreportedKpi').textContent=result ? formatNumber(result.unreported) : '—';
  rateNode.hidden=!result;
  if(result) {
    const rate=result.assigned ? 100*result.fulfilled/result.assigned : 0;
    rateValueNode.textContent=`${rate.toFixed(1)}%`;
    rateBarNode.style.width=`${Math.min(rate,100)}%`;
  }
}
document.addEventListener('landcare:pilot-report-status',event=>{
  if(event.detail.period!==state.month || event.detail.organization!==state.organization) return;
  pilotDetail=event.detail;
  state.evidenceCache.clear();
  state.features=pilotOverviewFeatures(state.features,pilotDetail);
  updatePilotMetrics();
  renderOverview();
  if(state.selectedObjectId) {
    const feature=state.features.find(item=>String(item.properties.objectid)===state.selectedObjectId);
    if(feature) selectFeature(feature,{keepView:true});
  }
});

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function blockLot(value) {
  const raw = String(value || "").trim().toUpperCase();
  const blockLotMatch = raw.match(/^0*(\d+)\s*-?\s*([A-Z])\s*-?\s*0*(\d+)$/);
  if (blockLotMatch) return `${Number(blockLotMatch[1])}-${blockLotMatch[2]}-${Number(blockLotMatch[3])}`;
  const pin = parcelDigits(value);
  if (!/^[0-9]{4}[A-Z][0-9]{5}/.test(pin)) return pin || "Parcel";
  return `${Number(pin.slice(0, 4))}-${pin[4]}-${Number(pin.slice(5, 10))}`;
}

function featureBlockLot(feature) {
  const props = feature.properties || {};
  return blockLot(props.block_lot || props.parcel_number || props.parcel_key);
}

function statusFor(feature) {
  return feature.properties?.pilot_status || 'unknown';
}

function visibleFeatures() {
  return state.features.filter(feature=>matchesParcelFilters(feature,readParcelFilters()));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function dateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function relativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const midnight = (input) => new Date(input.getFullYear(), input.getMonth(), input.getDate());
  const difference = Math.round((midnight(new Date()) - midnight(date)) / 86400000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  if (difference > 1) return `${difference} days ago`;
  return "";
}

function surveyPhotoMarkup(photo) {
  const imageUrl = safeImageUrl(photo.image_url);
  const serviceDate = photo.service_date || photo.created_at || photo.submitted_at;
  const source = photo.evidence_source === "Survey123" ? "Survey123" : "Regrid";
  const notes = String(photo.additional_notes || photo.additional_comments || photo.additional_note || photo.notes || "").trim();
  if (!imageUrl) {
    if (!notes) return "";
    const date = serviceDate ? `<span>${escapeHtml(source)} service: ${escapeHtml(dateLabel(serviceDate))}</span>` : "";
    return `<section class="survey-photo-evidence survey-evidence-context-only"><div class="survey-photo-context">${date}<p>${escapeHtml(notes)}</p></div></section>`;
  }
  return `<section class="survey-photo-evidence">
    <a href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open full ${source} photo">
      <img data-evidence-photo src="${escapeHtml(imageUrl)}" alt="${source} survey photo" loading="lazy" referrerpolicy="no-referrer" />
    </a>
    ${serviceDate ? `<div class="survey-photo-context"><span>${escapeHtml(source)} service: ${escapeHtml(dateLabel(serviceDate))}${relativeDate(serviceDate) ? ` · ${escapeHtml(relativeDate(serviceDate))}` : ""}</span>${notes ? `<p>${escapeHtml(notes)}</p>` : ""}</div>` : notes ? `<div class="survey-photo-context"><p>${escapeHtml(notes)}</p></div>` : ""}
  </section>`;
}

function bindPhotoFallbacks() {
  for (const image of detailNode.querySelectorAll("img[data-evidence-photo]:not([data-fallback-bound])")) {
    image.dataset.fallbackBound = "true";
    image.addEventListener("error", () => {
      const card = image.closest(".survey-photo-evidence");
      const context = card?.querySelector(".survey-photo-context");
      if (context) {
        card.classList.add("survey-evidence-context-only");
        image.closest("a")?.remove();
      } else {
        card?.remove();
      }
      if (!detailNode.querySelector(".survey-photo-evidence")) {
        const gallery = detailNode.querySelector(".survey-photo-gallery");
        if (gallery) gallery.outerHTML = '<div class="survey-photo-empty">Returned photo could not be loaded. Please try the original service record later.</div>';
      }
    }, { once: true });
  }
}

function parcelDetailMarkup(props, {loadingEvidence=false}={}) {
  const records=props.pilot_reports || [];
  const reports=records.map(report=>`<section class="survey-photo-evidence"><div class="survey-photo-context">
    <strong>${escapeHtml(report.answer==='Yes' ? 'Reported Yes' : 'Reported No')}</strong>
    <p>Submitted ${escapeHtml(dateLabel(report.submittedAt))}</p>
    ${report.comments ? `<p><b>Comments:</b> ${escapeHtml(report.comments)}</p>` : ''}</div>
    ${(report.photos || []).map(photo=>{const url=safeImageUrl(photo.image_url);return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img data-evidence-photo src="${escapeHtml(url)}" alt="Pilot report photo" loading="lazy" referrerpolicy="no-referrer" /></a>` : '';}).join('')}
    ${report.photoError ? '<p>Photo could not be read. The saved report remains available.</p>' : ''}
  </section>`);
  return `<div class="contractor-parcel-detail__summary">
    <strong>${escapeHtml(blockLot(props.block_lot || props.parcel_number || props.parcel_key))}</strong>
    <span>${escapeHtml(props.address || 'Address unavailable')}</span>
    <span><b>Type:</b> ${escapeHtml(assignmentType(props))}${assignmentType(props)==='Request Only' ? ' · report service only when asked' : ''}</span>
    <span><b>Status:</b> ${escapeHtml(pilotStatusLabel(props.pilot_status))}</span>
    <span><b>Service period:</b> ${escapeHtml(props.period_month || state.month)}</span>
    <span>${records.length} report(s) for this period. Contractor answers are not staff approval.</span>
    </div>
    <button type="button" class="contractor-submit-parcel">${records.length ? 'Report another visit' : 'Report service for this parcel'}</button>
    ${loadingEvidence ? '<p>Loading pilot photos…</p>' : ''}
    ${reports[0] || (props.pilot_status==='unknown' ? '<p>Pilot reports could not be loaded.</p>' : '<p>No pilot report for this parcel and period.</p>')}
    ${records.length > 1 ? `<details class="report-history"><summary>View older reports (${records.length-1})</summary>${reports.slice(1).join('')}</details>` : ''}`;
}
function setEmptyState(message) {
  state.features=[];
  state.selectedObjectId='';
  pilotDetail=null;
  detailVersion++;
  titleNode.textContent = message;
  assignedNode.textContent = "--";
  submittedNode.textContent = "--";
  openNode.textContent = "--";
  document.getElementById("contractorUnreportedKpi").textContent="—";
  rateNode.hidden = true;
  detailNode.textContent = "Choose an organization, then select an open parcel to begin its service submission.";
  state.layer?.removeAll();
  renderList();
}

function featureGeometry(feature) {
  const rings = feature?.geometry?.coordinates;
  if (!Array.isArray(rings) || !rings.length) return null;
  return { type: "polygon", rings, spatialReference: { wkid: 4326 } };
}

function symbolFor(feature) {
  return parcelSymbol(feature.properties.pilot_status,String(feature.properties.objectid)===state.selectedObjectId,assignmentType(feature.properties)==='Request Only');
}

function labelGraphic(feature) {
  const geometry = featureGeometry(feature);
  const points = (geometry?.rings || []).flat().filter((point) => (
    Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
  ));
  const center = points.length
    ? {
        type: "point",
        longitude: (Math.min(...points.map((point) => Number(point[0]))) + Math.max(...points.map((point) => Number(point[0])))) / 2,
        latitude: (Math.min(...points.map((point) => Number(point[1]))) + Math.max(...points.map((point) => Number(point[1])))) / 2,
        spatialReference: { wkid: 4326 }
      }
    : null;
  if (!center) return null;
  const selected = String(feature.properties.objectid) === state.selectedObjectId;
  const graphic = new Graphic({
    geometry: center,
    attributes: { label: true, assignmentObjectId: String(feature.properties.objectid) },
    symbol:labelSymbol(featureBlockLot(feature),selected)
  });
  graphic.visible=false;
  return graphic;
}

function renderMap() {
  if (!state.layer) return;
  state.layer.removeAll();
  const graphics = [];
  for (const feature of visibleFeatures()) {
    const geometry = featureGeometry(feature);
    if (!geometry) continue;
    graphics.push(new Graphic({
      geometry,
      attributes: { ...feature.properties, assignmentObjectId: String(feature.properties.objectid) },
      symbol: symbolFor(feature)
    }));
    const label = labelGraphic(feature);
    if (label) graphics.push(label);
  }
  state.layer.addMany(graphics);
  updateLabelVisibility();
}

function renderList() {
  if (!listNode) return;
  const features=[...visibleFeatures()].sort((a,b)=>compareParcels(a,b,state.listSort.key,state.listSort.direction));
  for(const button of document.querySelectorAll('[data-contractor-sort]')) {
    button.closest('th').setAttribute('aria-sort',button.dataset.contractorSort===state.listSort.key?(state.listSort.direction==='asc'?'ascending':'descending'):'none');
  }
  listTitleNode.textContent = state.statusFilter === "all" ? "All assigned parcels" : state.statusFilter==='open' ? 'Active remaining' : pilotStatusLabel(state.statusFilter);
  listSummaryNode.textContent = state.organization
    ? `${formatNumber(features.length)} shown · sorted by ${state.listSort.key === "block_lot" ? "block & lot" : state.listSort.key.replace("_", " ")}`
    : "Choose an organization to view assigned parcels.";
  listNode.innerHTML = features.length
    ? features.map((feature) => {
      const props = feature.properties || {};
      const submitted = statusFor(feature) === 'fulfilled';
      const selected = String(props.objectid) === state.selectedObjectId;
      return `<tr class="${selected ? "is-selected" : ""}">
        <td><strong>${escapeHtml(featureBlockLot(feature))}</strong></td>
        <td>${escapeHtml(props.address || "Address unavailable")}</td>
        <td><span class="assignment-type-badge">${escapeHtml(assignmentType(props))}</span></td>
        <td>${escapeHtml(props.council_district || "—")}</td>
        <td><span class="contractor-status-pill ${submitted ? "submitted" : "open"}">${escapeHtml(pilotStatusLabel(statusFor(feature)))}</span>${props.submitted_at ? `<small>${escapeHtml(dateLabel(props.submitted_at))}</small>` : ""}</td>
        <td><button type="button" class="contractor-list-select" data-contractor-list-id="${escapeHtml(props.objectid)}">View reports / report visit</button></td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="6" class="contractor-list-empty">No parcels match these filters. Use Clear filters to see all assigned parcels.</td></tr>`;
}

function renderOverview() {
  state.statusFilter=readParcelFilters().status;
  if(state.selectedObjectId&&!visibleFeatures().some(f=>String(f.properties.objectid)===state.selectedObjectId)) {
    state.selectedObjectId='';detailVersion++;
    detailNode.textContent='The inspected parcel is outside the current filters. Change or clear filters to see it again.';
  }
  renderMap();
  renderList();
  document.querySelectorAll("[data-contractor-status]").forEach((button) => {
    const active = button.dataset.contractorStatus === state.statusFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateLabelVisibility() {
  declutterMapLabels(state.view,state.layer?.graphics||[],{focusedId:state.selectedObjectId,selectedIds:new Set([state.selectedObjectId])});
}

function selectForSubmission(feature) {
  const objectId = String(feature.properties.objectid);
  if ([...parcelSelect.options].some((option) => option.value === objectId)) {
    parcelSelect.value = objectId;
    parcelSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  setTab("submit");
}

function setTab(tab) {
  const selected = tab === "submit" ? "submit" : "overview";
  document.querySelectorAll("[data-contractor-tab]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.contractorTab === selected);
  });
  document.querySelectorAll("[data-contractor-panel]").forEach((panel) => {
    const active = panel.dataset.contractorPanel === selected;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  const url = new URL(window.location.href);
  url.searchParams.set("tab", selected);
  history.replaceState({}, "", url);
  document.body.dataset.activeTab=selected;
  document.dispatchEvent(new CustomEvent("landcare:tab-changed",{detail:{tab:selected}}));
  if (selected === "overview") state.view?.resize?.();
}

function setOverviewView(view) {
  state.overviewView = view === "list" ? "list" : "map";
  const showList = state.overviewView === "list";
  mapCardNode.hidden = showList;
  listCardNode.hidden = !showList;
  document.querySelectorAll("[data-contractor-view]").forEach((button) => {
    const active = button.dataset.contractorView === state.overviewView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (!showList) requestAnimationFrame(() => state.view?.resize?.());
}

function syncUrlContext() {
  const url = new URL(window.location.href);
  if (state.month) url.searchParams.set("month", state.month);
  if (state.organization) url.searchParams.set("organization", state.organization);
  history.replaceState({}, "", url);
}

function applyEvidence(features, surveyRows, survey123Rows) {
  const activeFeatures = features.filter((feature) => feature.properties.maintenance_level === "Active");
  const assignmentPins = new Set(activeFeatures.map((feature) => parcelDigits(feature.properties.parcel_key)).filter(Boolean));
  const regridMatches = surveyRows.filter((row) => assignmentPins.has(parcelDigits(row.parcelnumb)));
  const regridPins = new Set(regridMatches.map((row) => parcelDigits(row.parcelnumb)));
  const survey123AssignmentIds = new Set();
  for (const evidence of survey123Rows) {
    const match = activeFeatures.find((feature) => survey123EvidenceMatchesAssignment(evidence, feature.properties));
    if (match) survey123AssignmentIds.add(String(match.properties.objectid));
  }
  const returnedIds = new Set(activeFeatures
    .filter((feature) => regridPins.has(parcelDigits(feature.properties.parcel_key)))
    .map((feature) => String(feature.properties.objectid)));
  survey123AssignmentIds.forEach((id) => returnedIds.add(id));
  const survey123Only = [...survey123AssignmentIds].filter((id) => !regridPins.has(parcelDigits(
    activeFeatures.find((feature) => String(feature.properties.objectid) === id)?.properties.parcel_key
  ))).length;
  const enriched = activeFeatures.map((feature) => {
    const returned = returnedIds.has(String(feature.properties.objectid));
    const latestSurvey = surveyRows
      .filter((row) => parcelDigits(row.parcelnumb) === parcelDigits(feature.properties.parcel_key))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
    return { ...feature, properties: { ...feature.properties, returned_flag: returned, submitted_at: latestSurvey?.created_at || null } };
  });
  const submitted = regridMatches.length + survey123Only;
  return { features: enriched, submitted, assigned: activeFeatures.length, open: Math.max(activeFeatures.length - submitted, 0) };
}

async function enrichWithParcelReference(features) {
  const missing = [...new Set(features
    .map((feature) => String(feature.properties?.parcel_number || feature.properties?.parcel_key || "").trim())
    .filter((parcel) => parcel && !state.parcelReference.has(parcel)))];
  for (let start = 0; start < missing.length; start += 80) {
    const batch = missing.slice(start, start + 80);
    const where = `parcel_number IN (${batch.map((parcel) => `'${parcel.replace(/'/g, "''")}'`).join(",")})`;
    const payload = await fetchArcgisJson(`${EPP_PARCEL_LAYER_URL}/query`, {
      f: "json",
      where,
      outFields: "parcel_number,par_mapblocklo,council_district",
      returnGeometry: "false"
    });
    (payload.features || []).forEach((record) => {
      const attrs = record.attributes || {};
      if (attrs.parcel_number) state.parcelReference.set(String(attrs.parcel_number), {
        block_lot: attrs.par_mapblocklo || "",
        council_district: attrs.council_district || ""
      });
    });
  }
  const withParcelReference = features.map((feature) => {
    const props = feature.properties || {};
    const reference = state.parcelReference.get(String(props.parcel_number || props.parcel_key || "")) || {};
    return { ...feature, properties: { ...props, ...reference, block_lot: reference.block_lot || props.block_lot || "" } };
  });
  return enrichWithCouncilDistrict(withParcelReference);
}

function featureCenter(feature) {
  const points = (feature?.geometry?.coordinates || []).flat(Infinity)
    .filter((value) => Number.isFinite(Number(value)));
  if (points.length < 4) return null;
  const xs = points.filter((_, index) => index % 2 === 0).map(Number);
  const ys = points.filter((_, index) => index % 2 === 1).map(Number);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function loadCouncilDistricts() {
  if (state.councilDistricts) return state.councilDistricts;
  const payload = await fetchArcgisJson(`${COUNCIL_DISTRICT_LAYER_URL}/query`, {
    f: "json",
    where: "1=1",
    outFields: "DIST_ID",
    returnGeometry: "true",
    outSR: "4326"
  });
  state.councilDistricts = (payload.features || []).map((record) => ({
    district: String(record.attributes?.DIST_ID || ""),
    rings: record.geometry?.rings || []
  }));
  return state.councilDistricts;
}

async function enrichWithCouncilDistrict(features) {
  const districts = await loadCouncilDistricts().catch(() => []);
  if (!districts.length) return features;
  return features.map((feature) => {
    const props = feature.properties || {};
    const center = featureCenter(feature);
    const district = center && districts.find((candidate) => candidate.rings.some((ring) => pointInRing(center, ring)))?.district;
    // The Monitoring map treats the Council District boundary layer as
    // authoritative. Prefer that spatial result over a stale EPP attribute.
    return district ? { ...feature, properties: { ...props, council_district: district } } : feature;
  });
}

async function enrichWithSurveyEvidence(feature) {
  const layer=pilotDetail?.parentLayerUrl;
  const records=await Promise.all((feature.properties.pilot_reports || []).map(async report=>{
    const cacheKey=`${layer}|${report.eventId}`;
    try {
      let photos=state.evidenceCache.get(cacheKey);
      if(!photos) {
        photos=await fetchPilotReportPhotos(layer,report.objectId);
        state.evidenceCache.set(cacheKey,photos);
      }
      return {...report,photos};
    } catch {return {...report,photoError:true,photos:[]};}
  }));
  return {...feature,properties:{...feature.properties,pilot_reports:records}};
}
async function refreshOverview() {
  const version=++overviewVersion;
  const month=state.month, organization=state.organization;
  if(!month || !organization) return setEmptyState('Choose an organization to view progress');
  pilotDetail=null;
  state.features=[];state.selectedObjectId='';state.layer?.removeAll();
  assignedNode.textContent='—';submittedNode.textContent='—';openNode.textContent='—';
  document.getElementById('contractorUnreportedKpi').textContent='—';rateNode.hidden=true;
  renderList();
  detailVersion++;
  titleNode.textContent=`${organization} pilot progress`;
  freshnessNode.textContent=`Loading ${month} assignments…`;
  detailNode.textContent='Loading assigned parcels and pilot reports…';
  try {
    const data=await fetchAssignmentGeojsonForPeriod(month,organizationSelect.value || organization);
    let features=data.features.filter(feature=>cleanOrganization(feature.properties.organization)===organization && ['Active','Request Only'].includes(feature.properties.maintenance_level));
    // Optional district/reference enrichment must not delay usable parcels.
    const referenceFeatures=features;
    if(version!==overviewVersion || state.month!==month || state.organization!==organization) return;
    state.features=pilotOverviewFeatures(features,pilotDetail);
    state.selectedObjectId='';
    updatePilotMetrics();
    freshnessNode.textContent=`${month} · ${organization} · pilot reports`;
    renderOverview();
    detailNode.textContent=features.length ? 'Select a parcel to see its reports or record a visit.' : 'No active parcels in this period.';
    const geometries=state.layer?.graphics.filter(graphic=>!graphic.attributes?.label).map(graphic=>graphic.geometry);
    if(geometries?.length) state.view?.goTo(geometries,{duration:450}).catch(()=>{});
    document.dispatchEvent(new CustomEvent('landcare:pilot-overview-ready'));
    enrichWithParcelReference(referenceFeatures).then(enriched=>{
      if(version!==overviewVersion) return;
      state.features=pilotOverviewFeatures(enriched,pilotDetail);renderOverview();
    }).catch(()=>{});
  } catch(error) {
    if(version!==overviewVersion) return;
    setEmptyState('Pilot progress unavailable');
    detailNode.textContent=`Unable to load assignments: ${error.message}`;
  }
}
async function initializeMap() {
  await waitForWorkspaceTab("overview");
  const modules=await loadMapModules();
  [Map,MapView,Graphic,GraphicsLayer,BasemapToggle,Zoom]=modules.slice(0,6).map(module=>module.default);
  addFindMyLocation=modules[6].addFindMyLocation;
  state.layer = new GraphicsLayer();
  state.map = new Map({ basemap: "gray-vector", layers: [state.layer] });
  state.view = new MapView({
    container: mapNode,
    map: state.map,
    center: [-79.9959, 40.4406],
    zoom: 12,
    ui: { components: [] }
  });
  await withTimeout(state.view.when(),"The progress map");
  addFindMyLocation(state.view);
  state.view.ui.add(new Zoom({ view: state.view }), "bottom-right");
  state.view.ui.add(new BasemapToggle({ view: state.view, nextBasemap: "hybrid" }), "bottom-right");
  state.view.watch("stationary",updateLabelVisibility);
  state.view.watch("size",updateLabelVisibility);
  state.view.on("click", async (event) => {
    const hit = await state.view.hitTest(event).catch(() => null);
    const graphic = hit?.results.map((result) => result.graphic).find((item) => item?.attributes?.assignmentObjectId && !item.attributes?.label);
    if (!graphic) return;
    const feature = state.features.find((item) => String(item.properties.objectid) === String(graphic.attributes.assignmentObjectId));
    selectFeature(feature);
  });
  refreshOverview();
}

document.querySelectorAll("[data-contractor-view]").forEach((button) => button.addEventListener("click", () => {
  setOverviewView(button.dataset.contractorView);
}));

document.querySelectorAll("[data-contractor-sort]").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.contractorSort;
  state.listSort = {
    key,
    direction: state.listSort.key === key && state.listSort.direction === "asc" ? "desc" : "asc"
  };
  renderList();
}));

listNode?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-contractor-list-id]");
  if (!button) return;
  const feature = state.features.find((item) => String(item.properties.objectid) === button.dataset.contractorListId);
  if (!feature) return;
  setOverviewView("map");
  selectFeature(feature);
});

document.querySelectorAll("[data-contractor-tab]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  setTab(link.dataset.contractorTab);
}));

document.addEventListener("landcare:contractor-context", (event) => {
  const next = event.detail || {};
  const changed = state.month !== next.month || state.organization !== next.organization;
  state.month = next.month;
  state.organization = next.organization;
  syncUrlContext();
  if (changed) {
    refreshOverview();
  } else if (next.parcel) {
    const selected = state.features.find((feature) => String(feature.properties.objectid) === String(next.parcel));
    if (selected) selectFeature(selected);
  }
});

window.addEventListener("popstate", () => {
  const tab = new URLSearchParams(window.location.search).get("tab") || "overview";
  setTab(tab);
});

setTab(new URLSearchParams(window.location.search).get("tab") || "overview");
document.addEventListener('landcare:filters-changed',()=>{
  if(state.view) state.view.popup?.close();
  renderOverview();
  const graphics=state.layer?.graphics.filter(g=>!g.attributes?.label).map(g=>g.geometry);
  if(graphics?.length) state.view?.goTo(graphics,{duration:300}).catch(()=>{});
});
setOverviewView("map");
initializeMap().catch(() => { detailNode.textContent = "The progress map could not load. Use the submission tab to select an assigned parcel."; });







