import Locate from 'https://js.arcgis.com/4.30/@arcgis/core/widgets/Locate.js';

// A one-time location request, never automatic tracking or a survey field.
export function addFindMyLocation(view) {
  const message = document.createElement('div');
  message.className = 'pilot-location-status esri-widget';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.textContent = 'Find my location centers the map; select parcels yourself.';
  const locate = new Locate({
    view,
    label: 'Find my location',
    geolocationOptions: { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  });
  const control = document.createElement('div');
  control.className = 'pilot-locate-control';
  locate.container = control;
  locate.on('locate', () => {
    message.textContent = 'Location shown for navigation only. Confirm the parcel boundary before selecting.';
  });
  locate.on('locate-error', (event) => {
    message.textContent = event.error?.code === 1
      ? 'Location permission was denied. You can still select parcels using the map or list.'
      : 'Unable to find your location. You can still select parcels using the map or list.';
  });
  // Keep clear of the overview's absolute-positioned parcel status toolbar.
  view.ui.add(control, { position: 'bottom-right', index: 0 });
  view.ui.add(message, 'bottom-left');
  return locate;
}
