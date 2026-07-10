/**
 * §6.6 Collect UI canon, adapted for the browser. Renders a multi-step form
 * into the mount element: address (step 1/4) → Street View (2/4, coverage-gated)
 * → property details (3/4) → consent (4/4) → "Address collected".
 *
 * The map / autocomplete / Street View use the Google Maps JavaScript API
 * (loaded on demand with `googleMapsApiKey`). Without a key the form degrades to
 * a manual address field. No verification happens here — on submit the form
 * hands back the collected `AddressData` (collect-only, mobile verifies).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AddressData, BusinessBranding } from './types';
import type { LocationProvider } from './location-provider';
import { svgIcon } from './icons';

type Gmaps = any;

interface FormConfig {
  googleMapsApiKey?: string;
  theme?: 'light' | 'dark' | 'system';
  locationProvider: LocationProvider;
  business?: BusinessBranding;
  /** Backend reference data for the Country/State dropdowns (falls back to the
   * small embedded lists when absent or on failure). */
  fetchCountries?: () => Promise<Array<{ code: string; name: string }>>;
  fetchStates?: (countryCode: string) => Promise<Array<{ code: string; name: string }>>;
}

type SubmitFn = (input: {
  lat: number;
  lon: number;
  formattedAddress: string;
  placeId?: string;
  country?: string;
  state?: string;
  city?: string;
  propertyNumber?: string;
  streetName?: string;
  buildingColor?: string;
  directions?: string;
  streetviewPanoId?: string;
}) => Promise<AddressData>;

const COLORS = ['White', 'Brown', 'Blue', 'Red', 'Grey', 'Yellow', 'Green', 'Cream'];

// ISO-3166 country names for the Country dropdown.
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', "Côte d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czechia',
  'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

// First-level subdivisions for countries where we drive a State dropdown. Keyed
// by the name Google returns for `country`. Countries not listed fall back to a
// free-text State field. Names match Google's `administrative_area_level_1`.
const SUBDIVISIONS: Record<string, string[]> = {
  Nigeria: [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
    'Federal Capital Territory', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun',
    'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
  ],
  Ghana: ['Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'],
  Kenya: ['Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa', 'Murang’a', 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'],
  'South Africa': ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'],
  'United States': ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'],
  Canada: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'],
};

let mapsLoading: Promise<void> | null = null;

/** Load the Google Maps JS API once (idempotent). */
function loadMaps(apiKey: string): Promise<void> {
  const w = window as any;
  if (w.google?.maps) return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(s);
  });
  return mapsLoading;
}

interface State {
  lat?: number;
  lon?: number;
  formattedAddress: string;
  placeId?: string;
  streetviewPanoId?: string;
  // Address components — auto-filled from the geocoded map pin, then editable.
  country: string;
  region: string; // state / province / administrative area
  city: string;
  propertyNumber: string;
  streetName: string;
  buildingColor: string;
  directions: string;
}

export class CollectForm {
  private readonly mount: HTMLElement;
  private readonly config: FormConfig;
  private readonly submitFn: SubmitFn;
  private readonly onCancel: () => void;
  /** Called after a successful collect so the flow can show its unified success. */
  private readonly onComplete?: (address: AddressData) => void;
  private readonly state: State = {
    formattedAddress: '',
    country: '',
    region: '',
    city: '',
    propertyNumber: '',
    streetName: '',
    buildingColor: '',
    directions: '',
  };
  /** 0=address, 1=streetview, 2=details, 3=consent. */
  private step = 0;
  /** §6.6 step 5: "Current Location | Search Address" input tabs. */
  private addrMode: 'current' | 'search' = 'current';
  private mapsReady = false;
  private submitting = false;
  /**
   * True once the pin reflects a real choice — a granted location fix, a dragged
   * map, or a search selection. Until then we must NOT reverse-geocode the
   * default map centre (which would show a bogus "current" address).
   */
  private userPinned = false;
  /** Guards against firing the auto-locate request more than once. */
  private autoLocateTried = false;
  /** Backend reference data (null until loaded; falls back to embedded lists). */
  private countries: Array<{ code: string; name: string }> | null = null;
  private countriesLoading = false;
  /** Lazily-loaded states per ISO country code. */
  private readonly statesByCode: Record<string, Array<{ code: string; name: string }>> = {};
  private statesLoadingFor: string | null = null;

  constructor(
    mount: HTMLElement,
    config: FormConfig,
    submitFn: SubmitFn,
    onCancel: () => void,
    onComplete?: (address: AddressData) => void,
  ) {
    this.mount = mount;
    this.config = config;
    this.submitFn = submitFn;
    this.onCancel = onCancel;
    this.onComplete = onComplete;
  }

  async start(): Promise<void> {
    injectStyles();
    if (this.config.googleMapsApiKey) {
      try {
        await loadMaps(this.config.googleMapsApiKey);
        this.mapsReady = true;
      } catch {
        this.mapsReady = false;
      }
    }
    this.render();
  }

  private get hasKey(): boolean {
    return this.mapsReady && !!this.config.googleMapsApiKey;
  }

  // ── Rendering ──

  private render(): void {
    this.mount.innerHTML = '';
    const root = el('div', 'iq-root');
    applyBrandingVars(root, this.config.business);
    root.appendChild(this.header());
    root.appendChild(this.indicator());
    const body = el('div', 'iq-body');
    root.appendChild(body);
    this.mount.appendChild(root);

    switch (this.step) {
      case 0:
        this.renderAddress(body);
        break;
      case 1:
        this.renderStreetView(body);
        break;
      case 2:
        this.renderDetails(body);
        break;
      case 3:
        this.renderConsent(body);
        break;
    }
  }

  private header(): HTMLElement {
    const h = el('div', 'iq-header');
    const close = el('button', 'iq-close');
    close.innerHTML = svgIcon('x', 18);
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => this.onCancel();
    h.appendChild(close);
    return h;
  }

  /** §6.6 4-dot "Step X of 4" indicator. */
  private indicator(): HTMLElement {
    const wrap = el('div', 'iq-steps');
    for (let i = 0; i < 4; i++) {
      const dot = el('span', 'iq-dot' + (i <= this.step ? ' iq-dot-on' : ''));
      wrap.appendChild(dot);
    }
    const label = el('span', 'iq-step-label');
    label.textContent = `Step ${this.step + 1} of 4`;
    wrap.appendChild(label);
    return wrap;
  }

  private renderAddress(body: HTMLElement): void {
    body.appendChild(title('Your location', 'Search your address or drop a pin on the map.'));

    if (this.hasKey) {
      // §6.6 step 5: Current Location | Search Address tabs.
      const tabs = el('div', 'iq-tabs');
      (['current', 'search'] as const).forEach((m) => {
        const tab = el('button', 'iq-tab' + (this.addrMode === m ? ' iq-tab-on' : ''));
        tab.textContent = m === 'current' ? 'Current Location' : 'Search Address';
        tab.onclick = () => { this.addrMode = m; this.render(); };
        tabs.appendChild(tab);
      });
      body.appendChild(tabs);
    }

    if (this.hasKey && this.addrMode === 'search') {
      const search = inputEl('Search your address…');
      body.appendChild(search);
      const mapDiv = el('div', 'iq-map');
      body.appendChild(mapDiv);
      this.initMap(mapDiv, search as HTMLInputElement);
    } else if (this.hasKey) {
      const mapDiv = el('div', 'iq-map');
      body.appendChild(mapDiv);
      this.initMap(mapDiv, document.createElement('input'));
    }

    if (this.addrMode === 'current' || !this.hasKey) {
      const useLoc = button('Use my current location', 'iq-secondary');
      useLoc.onclick = () => this.useCurrentLocation();
      body.appendChild(useLoc);
    }

    body.appendChild(label('Formatted address'));
    const addr = el('div', 'iq-readonly');
    addr.id = 'iq-addr';
    addr.textContent = this.state.formattedAddress || 'Move the map or search to set your address.';
    body.appendChild(addr);

    if (!this.hasKey) {
      // Manual fallback.
      const manual = inputEl('e.g. 1 Marina, Lagos Island, Lagos');
      (manual as HTMLInputElement).value = this.state.formattedAddress;
      manual.oninput = (e) => { this.state.formattedAddress = (e.target as HTMLInputElement).value; };
      body.appendChild(manual);
    }

    body.appendChild(this.footer('Continue', () => this.continueFromAddress()));
  }

  private renderStreetView(body: HTMLElement): void {
    body.appendChild(title('Confirm your building', 'Drag the view to frame your building, then confirm.'));
    const pano = el('div', 'iq-pano');
    body.appendChild(pano);
    if (this.hasKey && this.state.lat != null && this.state.lon != null) {
      const g: Gmaps = (window as any).google;
      const sv = new g.maps.StreetViewPanorama(pano, {
        position: { lat: this.state.lat, lng: this.state.lon },
        pov: { heading: 0, pitch: 0 },
        addressControl: false,
        fullscreenControl: false,
      });
      try { this.state.streetviewPanoId = sv.getPano?.() ?? this.state.streetviewPanoId; } catch { /* ignore */ }
    }
    body.appendChild(this.footer('Confirm', () => { this.step = 2; this.render(); }, () => { this.step = 0; this.render(); }));
  }

  private renderDetails(body: HTMLElement): void {
    body.appendChild(title('Property details', 'Confirm your address and help us identify your building.'));

    // — Address: pre-filled from the selected map pin, but editable. —
    // Country/State come from the backend reference list (cached), falling back
    // to the small embedded lists when the backend is unreachable.
    this.ensureCountries();
    body.appendChild(section('Address'));
    const countryNames = (this.countries?.map((c) => c.name)) ?? COUNTRIES;
    body.appendChild(this.selectField('Country', 'country', countryNames, () => {
      // Country changed → any state from the old country no longer applies.
      this.state.region = '';
      this.render();
    }));
    const row = el('div', 'iq-row');
    row.appendChild(this.stateField());
    row.appendChild(this.textField('City', 'city', 'City'));
    body.appendChild(row);
    body.appendChild(this.textField('Street name', 'streetName', 'Street name'));

    // — Building —
    body.appendChild(section('Building'));
    body.appendChild(this.textField('House / building number', 'propertyNumber', 'e.g. 12B'));
    body.appendChild(this.colorField());
    body.appendChild(this.textField('Nearby landmark / directions (optional)', 'directions', 'Nearby landmark'));

    const isValid = () => !!(this.state.propertyNumber.trim() && this.state.streetName.trim() && this.state.buildingColor.trim());
    body.appendChild(this.footer('Continue', () => { if (isValid()) { this.step = 3; this.render(); } }, () => { this.step = 0; this.render(); }));
  }

  /** A labelled text input bound to a string field of `state`. */
  private textField(labelText: string, key: 'country' | 'region' | 'city' | 'streetName' | 'propertyNumber' | 'directions', placeholder: string): HTMLElement {
    const wrap = el('div', 'iq-field');
    wrap.appendChild(label(labelText));
    const i = inputEl(placeholder) as HTMLInputElement;
    i.value = this.state[key];
    i.oninput = (e) => { this.state[key] = (e.target as HTMLInputElement).value; };
    wrap.appendChild(i);
    return wrap;
  }

  /**
   * The State control: a dropdown of the selected country's subdivisions when we
   * have them (from the backend, or the embedded fallback), else a free-text field.
   */
  private stateField(): HTMLElement {
    const countryName = this.state.country;
    if (this.config.fetchStates) {
      // Backend mode — resolve the ISO code for the chosen country, then lazy-load.
      const code = this.countries?.find((c) => c.name === countryName)?.code;
      if (code) {
        this.ensureStates(code);
        const list = this.statesByCode[code];
        if (list && list.length) return this.selectField('State', 'region', list.map((s) => s.name));
        // Loaded-but-empty (no subdivisions) or still loading → free-text for now.
      }
      return this.textField('State', 'region', 'State / province');
    }
    // Fallback mode — embedded subdivisions keyed by country name.
    const subs = SUBDIVISIONS[countryName];
    return subs ? this.selectField('State', 'region', subs) : this.textField('State', 'region', 'State / province');
  }

  /** Load the country list once (cached upstream); re-render when it arrives. */
  private ensureCountries(): void {
    if (this.countries || this.countriesLoading || !this.config.fetchCountries) return;
    this.countriesLoading = true;
    void this.config
      .fetchCountries()
      .then((list) => {
        this.countriesLoading = false;
        if (list && list.length) {
          this.countries = list;
          if (this.step === 2) this.render();
        }
      })
      .catch(() => { this.countriesLoading = false; });
  }

  /** Lazy-load one country's states (cached upstream); re-render when they arrive. */
  private ensureStates(code: string): void {
    if (!code || !this.config.fetchStates) return;
    if (this.statesByCode[code] || this.statesLoadingFor === code) return;
    this.statesLoadingFor = code;
    void this.config
      .fetchStates(code)
      .then((list) => {
        this.statesLoadingFor = null;
        this.statesByCode[code] = list ?? [];
        if (this.step === 2) this.render();
      })
      .catch(() => { this.statesLoadingFor = null; });
  }

  /** A labelled `<select>` bound to a string field of `state`. Preserves an
   * out-of-list value (e.g. a geocoded region we don't have in our data). */
  private selectField(labelText: string, key: 'country' | 'region', options: string[], onChange?: () => void): HTMLElement {
    const wrap = el('div', 'iq-field');
    wrap.appendChild(label(labelText));
    const sel = document.createElement('select');
    sel.className = 'iq-input iq-select';
    const cur = this.state[key];
    const list = cur && !options.includes(cur) ? [cur, ...options] : options;
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = `Select ${labelText.toLowerCase()}`;
    sel.appendChild(ph);
    list.forEach((o) => {
      const op = document.createElement('option');
      op.value = o;
      op.textContent = o;
      sel.appendChild(op);
    });
    sel.value = cur || '';
    sel.onchange = (e) => { this.state[key] = (e.target as HTMLSelectElement).value; if (onChange) onChange(); };
    wrap.appendChild(sel);
    return wrap;
  }

  /** Building colour as a free-text field with the common colours as suggestions. */
  private colorField(): HTMLElement {
    const wrap = el('div', 'iq-field');
    wrap.appendChild(label('Building color'));
    const i = inputEl('e.g. White') as HTMLInputElement;
    i.value = this.state.buildingColor;
    i.setAttribute('list', 'iq-colors-list');
    i.oninput = (e) => { this.state.buildingColor = (e.target as HTMLInputElement).value; };
    wrap.appendChild(i);
    const dl = document.createElement('datalist');
    dl.id = 'iq-colors-list';
    COLORS.forEach((c) => { const o = document.createElement('option'); o.value = c; dl.appendChild(o); });
    wrap.appendChild(dl);
    return wrap;
  }

  private renderConsent(body: HTMLElement): void {
    body.appendChild(title('Almost done!', 'Review and confirm to collect your address.'));
    const row = el('label', 'iq-consent');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    const span = el('span', '');
    span.textContent =
      this.config.business?.consentCopy ??
      'I consent to AddressIQ collecting my address for verification.';
    row.appendChild(cb);
    row.appendChild(span);
    body.appendChild(row);
    const submit = this.footer(this.submitting ? 'Submitting…' : 'Collect address', () => {
      if (cb.checked && !this.submitting) void this.doSubmit();
    }, () => { this.step = 2; this.render(); });
    body.appendChild(submit);
  }

  // ── Behavior ──

  private initMap(mapDiv: HTMLElement, search: HTMLInputElement): void {
    const g: Gmaps = (window as any).google;
    const center = { lat: this.state.lat ?? 6.5244, lng: this.state.lon ?? 3.3792 };
    const map = new g.maps.Map(mapDiv, { center, zoom: 16, disableDefaultUI: true, gestureHandling: 'greedy' });
    // Fixed centre pin — its tip marks the chosen point as the user drags the map.
    const pin = el('div', 'iq-map-pin');
    pin.innerHTML = svgIcon('map-pin', 40);
    mapDiv.appendChild(pin);
    const geocoder = new g.maps.Geocoder();

    // Dragging the map is an explicit choice — from now on, geocode the centre.
    map.addListener('dragend', () => { this.userPinned = true; });

    map.addListener('idle', () => {
      const c = map.getCenter();
      this.state.lat = c.lat();
      this.state.lon = c.lng();
      this.state.placeId = undefined;
      // Don't reverse-geocode the default view — only once the pin means something.
      if (!this.userPinned) return;
      geocoder.geocode({ location: { lat: this.state.lat, lng: this.state.lon } }, (res: any[], status: string) => {
        if (status === 'OK' && res[0]) this.applyGeocode(res[0]);
      });
    });

    // On entering the address step, ask the location provider for the current
    // fix and centre the map there (browser prompts here; a native shell returns
    // its Always/Precise fix over the bridge). If denied, the user can drag or search.
    if (this.state.lat == null && !this.autoLocateTried) {
      this.autoLocateTried = true;
      void this.config.locationProvider
        .getCurrentPosition()
        .then((fix) => {
          this.userPinned = true;
          this.state.lat = fix.lat;
          this.state.lon = fix.lon;
          this.state.placeId = undefined;
          map.setCenter({ lat: fix.lat, lng: fix.lon }); // → idle → geocode
        })
        .catch(() => { /* denied/unavailable — search or drop a pin instead */ });
    }

    const ac = new g.maps.places.Autocomplete(search, {
      fields: ['geometry', 'formatted_address', 'place_id', 'address_components'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (place.geometry?.location) {
        this.userPinned = true;
        this.state.lat = place.geometry.location.lat();
        this.state.lon = place.geometry.location.lng();
        this.state.placeId = place.place_id;
        this.applyGeocode(place);
        map.setCenter(place.geometry.location);
      }
    });
  }

  private setFormatted(addr: string): void {
    this.state.formattedAddress = addr;
    const node = this.mount.querySelector('#iq-addr');
    if (node) node.textContent = addr || 'Move the map or search to set your address.';
  }

  /**
   * Apply a Google geocode / place result: update the formatted address and
   * pull structured components (country / state / city / street) into state so
   * the Property-details fields are pre-filled — still fully editable there.
   */
  private applyGeocode(result: { formatted_address?: string; address_components?: any[] }): void {
    this.setFormatted(result.formatted_address ?? '');
    const comps = result.address_components ?? [];
    const pick = (...types: string[]): string => {
      for (const t of types) {
        const c = comps.find((x) => Array.isArray(x.types) && x.types.includes(t));
        if (c?.long_name) return c.long_name;
      }
      return '';
    };
    const country = pick('country');
    const region = pick('administrative_area_level_1');
    const city = pick('locality', 'postal_town', 'administrative_area_level_2', 'sublocality');
    const route = pick('route');
    const streetNumber = pick('street_number');
    if (country) this.state.country = country;
    if (region) this.state.region = region;
    if (city) this.state.city = city;
    if (route) this.state.streetName = route;
    if (streetNumber) this.state.propertyNumber = streetNumber;
  }

  private useCurrentLocation(): void {
    // Location comes from the injected provider — browser geolocation in a plain
    // browser, or the native shell (Always/Precise) inside a webview.
    void this.config.locationProvider
      .getCurrentPosition()
      .then((fix) => {
        this.userPinned = true;
        this.state.lat = fix.lat;
        this.state.lon = fix.lon;
        this.state.placeId = undefined;
        if (this.hasKey) {
          const g: Gmaps = (window as any).google;
          new g.maps.Geocoder().geocode({ location: { lat: this.state.lat, lng: this.state.lon } }, (res: any[], status: string) => {
            if (status === 'OK' && res[0]) this.applyGeocode(res[0]);
          });
        }
        this.render();
      })
      .catch(() => { /* provider unavailable/denied — user can still search/type */ });
  }

  private continueFromAddress(): void {
    if (this.state.lat == null || this.state.lon == null) return;
    // Require a real address choice, not just the default map centre.
    if (!this.state.formattedAddress) return;
    // §6.6 step 6 is coverage-gated: show Street View only when a panorama exists.
    if (this.hasKey) {
      const g: Gmaps = (window as any).google;
      new g.maps.StreetViewService().getPanorama(
        { location: { lat: this.state.lat, lng: this.state.lon }, radius: 50 },
        (_data: any, status: string) => {
          this.step = status === 'OK' ? 1 : 2;
          this.render();
        },
      );
      return;
    }
    this.step = 2;
    this.render();
  }

  private async doSubmit(): Promise<void> {
    if (this.state.lat == null || this.state.lon == null) return;
    this.submitting = true;
    this.render();
    try {
      const address = await this.submitFn({
        lat: this.state.lat,
        lon: this.state.lon,
        formattedAddress: this.state.formattedAddress,
        placeId: this.state.placeId,
        country: this.state.country || undefined,
        state: this.state.region || undefined,
        city: this.state.city || undefined,
        propertyNumber: this.state.propertyNumber,
        streetName: this.state.streetName,
        buildingColor: this.state.buildingColor,
        directions: this.state.directions || undefined,
        streetviewPanoId: this.state.streetviewPanoId,
      });
      if (this.onComplete) this.onComplete(address);
      else this.renderSuccess();
    } catch {
      this.submitting = false;
      this.render();
    }
  }

  private renderSuccess(): void {
    this.mount.innerHTML = '';
    const root = el('div', 'iq-root iq-success');
    root.appendChild(title('Address collected', 'Your address has been saved.'));
    this.mount.appendChild(root);
  }

  private footer(primary: string, onPrimary: () => void, onBack?: () => void): HTMLElement {
    const f = el('div', 'iq-footer');
    if (onBack) {
      const back = button('Back', 'iq-secondary');
      back.onclick = onBack;
      f.appendChild(back);
    }
    const btn = button(primary, 'iq-primary');
    btn.onclick = onPrimary;
    f.appendChild(btn);
    return f;
  }
}

// ── Tiny DOM helpers ──

export function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

export function title(t: string, sub: string): HTMLElement {
  const wrap = el('div', 'iq-title');
  const h = el('div', 'iq-h');
  h.textContent = t;
  const s = el('div', 'iq-sub');
  s.textContent = sub;
  wrap.appendChild(h);
  wrap.appendChild(s);
  return wrap;
}

function label(text: string): HTMLElement {
  const l = el('div', 'iq-label');
  l.textContent = text;
  return l;
}

/** A small section heading that groups related fields. */
function section(text: string): HTMLElement {
  const s = el('div', 'iq-section');
  s.textContent = text;
  return s;
}

function inputEl(placeholder: string): HTMLElement {
  const i = document.createElement('input');
  i.className = 'iq-input';
  i.placeholder = placeholder;
  return i;
}

export function button(text: string, className: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `iq-btn ${className}`;
  b.textContent = text;
  return b;
}

/**
 * Apply the tenant's theme to a widget root: primary/secondary colour via CSS
 * vars, corner style via `--iq-radius`, and the outline treatment via a class.
 * Shared by the Collect UI and the full flow so both honour every branding field.
 */
export function applyBrandingVars(
  root: HTMLElement,
  business?: {
    primaryColor?: string;
    secondaryColor?: string;
    borderRadius?: 'rounded' | 'more-rounded' | 'pill';
    buttonStyle?: 'filled' | 'outline';
  },
): void {
  if (!business) return;
  if (business.primaryColor) root.style.setProperty('--iq-primary', business.primaryColor);
  if (business.secondaryColor) root.style.setProperty('--iq-secondary', business.secondaryColor);
  const radius =
    business.borderRadius === 'pill' ? '9999px' :
    business.borderRadius === 'more-rounded' ? '14px' :
    business.borderRadius === 'rounded' ? '10px' : '';
  if (radius) root.style.setProperty('--iq-radius', radius);
  if (business.buttonStyle === 'outline') root.classList.add('iq-outline');
}

/** Inject the default IQCollect stylesheet once (partners can override via CSS). */
export function injectStyles(): void {
  if (document.getElementById('iq-styles')) return;
  const style = document.createElement('style');
  style.id = 'iq-styles';
  style.textContent = `
.iq-root,.iq-root *{box-sizing:border-box}
.iq-root{font-family:system-ui,-apple-system,sans-serif;width:100%;max-width:480px;min-height:100%;box-sizing:border-box;margin:0 auto;color:#111827;display:flex;flex-direction:column;gap:14px;padding:16px}
.iq-header{display:flex;justify-content:flex-end}
.iq-close{border:0;background:none;cursor:pointer;color:#6b7280;padding:4px;display:flex}
.iq-close svg{display:block}
.iq-steps{display:flex;align-items:center;gap:6px}
.iq-dot{width:8px;height:8px;border-radius:4px;background:#e5e7eb;transition:width .2s}
.iq-dot-on{width:20px;background:var(--iq-primary,#ff6b35)}
.iq-step-label{margin-left:auto;font-size:13px;font-weight:600;color:#6b7280}
.iq-body{display:flex;flex-direction:column;gap:12px;flex:1 1 auto}
.iq-tabs{display:flex;gap:8px}
.iq-tab{flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer}
.iq-tab-on{border-color:var(--iq-primary,#ff6b35);color:var(--iq-primary,#ff6b35)}
.iq-h{font-size:22px;font-weight:800}
.iq-sub{font-size:14px;color:#6b7280}
.iq-label{font-size:14px;font-weight:600}
.iq-readonly{border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#f9fafb;font-size:16px;min-height:20px}
/* font-size must be >=16px: iOS auto-zooms the page when focusing a smaller input. */
.iq-input{border:1px solid #d1d5db;border-radius:12px;padding:12px 14px;font-size:16px;width:100%;box-sizing:border-box;background:#fff;color:#111827}
.iq-select{appearance:none;-webkit-appearance:none;padding-right:38px;cursor:pointer;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 12px center}
.iq-map,.iq-pano{height:240px;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden}
.iq-map{position:relative}
.iq-map-pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);pointer-events:none;z-index:5;color:var(--iq-primary,#ff6b35)}
.iq-map-pin svg{display:block;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.iq-section{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-top:6px}
.iq-field{display:flex;flex-direction:column;gap:6px}
.iq-row{display:flex;gap:10px}
.iq-row>*{flex:1;min-width:0}
.iq-consent{display:flex;gap:10px;align-items:flex-start;font-size:14px}
.iq-footer{display:flex;gap:12px;margin-top:auto}
.iq-btn{flex:1;border:0;border-radius:var(--iq-radius,12px);padding:14px;font-size:15px;font-weight:600;cursor:pointer}
.iq-primary{background:var(--iq-primary,#ff6b35);color:#fff}
.iq-secondary{background:#f3f4f6;color:var(--iq-secondary,#111827)}
.iq-outline .iq-primary{background:transparent;color:var(--iq-primary,#ff6b35);border:1.5px solid var(--iq-primary,#ff6b35)}
`;
  document.head.appendChild(style);
}
