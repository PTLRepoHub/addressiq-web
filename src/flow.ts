/**
 * Top-level flow orchestrator — the shared source of truth for the collect/verify
 * journey across every platform. Screen order matches the reference (OkHi-style):
 *
 *   intro ("Keep Location Services On")
 *     → collaboration consent ("{business} uses AddressIQ…", accordion)
 *     → "Verify where you currently live"
 *     → address book ("Which address do you want to verify?")
 *          • has saved addresses → pick one → START VERIFICATION → done  (no collect steps)
 *          • "Verify a new address" / no saved addresses → collect flow → done
 *
 * The collect steps (address → streetview → details → consent) live in CollectForm
 * and run ONLY on the new-address path. Selecting a saved address is terminal.
 *
 * The native permission screen is intentionally NOT here — Always/Precise is owned
 * by the native shell and surfaced through the injected LocationProvider.
 */
import type { AddressData, BusinessBranding, SavedAddress } from './types';
import type { LocationProvider } from './location-provider';
import { CollectForm, el, title, button, injectStyles, applyBrandingVars } from './collect-form';
import { svgIcon, type IconName } from './icons';
import { BUILD_CONFIG } from './buildConfig';

export interface FlowConfig {
  business?: BusinessBranding;
  theme?: 'light' | 'dark' | 'system';
  /** Host OS (native shells only) — selects the platform-specific Settings screen. */
  platform?: 'ios' | 'android';
  locationProvider: LocationProvider;
  /** Fetch widget bootstrap config from the backend (business + Maps key). */
  loadConfig: () => Promise<{ business: BusinessBranding | null; googleMapsApiKey?: string }>;
  listAddresses: () => Promise<SavedAddress[]>;
  /** Reference data for the address form's Country/State dropdowns. */
  fetchCountries?: () => Promise<Array<{ code: string; name: string }>>;
  fetchStates?: (countryCode: string) => Promise<Array<{ code: string; name: string }>>;
  startVerification: (locationCode: string) => Promise<{ verificationId: string }>;
  submit: CollectFormSubmit;
  onClose: () => void;
}

type CollectFormSubmit = ConstructorParameters<typeof CollectForm>[2];

type Stage = 'loading' | 'intro' | 'collab' | 'live' | 'permission' | 'book' | 'collect' | 'success';

const ACCORDION: { icon: IconName; heading: string; body: (biz: string) => string }[] = [
  {
    icon: 'user',
    heading: 'We process personal data',
    body: (biz: string) =>
      `To deliver its service to you, ${biz} uses AddressIQ to collect and verify your address. ` +
      'This means we need to store and process some personal and location data. Our address ' +
      "verification uses some background location data when you're at your address.",
  },
  {
    icon: 'shield',
    heading: 'Your data belongs to you',
    body: () =>
      'Your data is yours. You can request access to it or ask us to delete it at any time, and ' +
      'we only use it to verify and update your address.',
  },
  {
    icon: 'lock',
    heading: 'We keep your data safe',
    body: () =>
      'Your data is encrypted in transit and at rest, and only shared with the business you are ' +
      'verifying your address for.',
  },
];

export class FlowController {
  private readonly mount: HTMLElement;
  private readonly config: FlowConfig;
  private stage: Stage = 'loading';
  private openAccordion = 0;
  private addresses: SavedAddress[] = [];
  private busy = false;
  /** True while the permission prompt is in flight — debounces taps + shows a
   * "Checking…" state so the button isn't spammed. */
  private liveRequesting = false;
  /** True once Always + Precise is detected on the Settings screen — flips the
   * button from "Open settings" to "Continue". */
  private permissionSatisfied = false;
  /** Backstop poll while the Settings screen is open (visibilitychange is primary). */
  private permissionPoll: ReturnType<typeof setInterval> | null = null;
  /** Resolved business branding: backend-provided values win over client config. */
  private business: BusinessBranding = { displayName: '' };
  /** Resolved Google Maps key: backend `/widget/config` wins (rotation), else the baked-in build key. */
  private googleMapsApiKey?: string;

  constructor(mount: HTMLElement, config: FlowConfig) {
    this.mount = mount;
    this.config = config;
  }

  async start(): Promise<void> {
    injectStyles();
    injectFlowStyles();
    // When the app returns to the foreground (e.g. back from the OS Settings app),
    // re-check permission so the "Location permission" screen can flip to Continue.
    document.addEventListener('visibilitychange', this.onHostVisible);
    window.addEventListener('focus', this.onHostVisible);
    this.render();
    // Business identity + Maps key belong to the backend (tenant behind the API
    // key). Client-supplied values are only fallbacks/overrides.
    const remote = await this.config
      .loadConfig()
      .catch((): { business: BusinessBranding | null; googleMapsApiKey?: string } => ({ business: null }));
    this.business = mergeBusiness(this.config.business, remote.business);
    // Hybrid, config-wins for rotation: the backend key (from /widget/config)
    // takes priority over the key baked into the bundle at build time.
    this.googleMapsApiKey = remote.googleMapsApiKey || BUILD_CONFIG.mapsKey;
    this.stage = 'intro';
    this.render();
  }

  private get businessName(): string {
    return this.business.displayName || 'This business';
  }

  private render(): void {
    this.mount.innerHTML = '';
    const root = el('div', 'iq-root');
    applyBrandingVars(root, this.business);
    root.appendChild(this.closeHeader());
    const body = el('div', 'iq-body');
    root.appendChild(body);
    // Powered-by is a persistent footer pinned to the bottom of the widget
    // (root flex column + body flex:1), not part of the scrolling content.
    root.appendChild(poweredBy());
    this.mount.appendChild(root);

    switch (this.stage) {
      case 'loading': body.appendChild(spinner('Setting up…')); break;
      case 'intro': this.renderIntro(body); break;
      case 'collab': this.renderCollab(body); break;
      case 'live': this.renderLive(body); break;
      case 'permission': this.renderPermissionSettings(body); break;
      case 'book': this.renderBook(body); break;
      case 'success': this.renderSuccess(body); break;
      case 'collect': /* handled by mountCollect */ break;
    }
  }

  private closeHeader(): HTMLElement {
    const h = el('div', 'iq-header');
    const close = el('button', 'iq-close');
    close.innerHTML = svgIcon('x', 20);
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => { this.cleanup(); this.config.onClose(); };
    h.appendChild(close);
    return h;
  }

  /** Detach resume listeners + stop the poll (called on close). */
  private cleanup(): void {
    this.stopPermissionPoll();
    document.removeEventListener('visibilitychange', this.onHostVisible);
    window.removeEventListener('focus', this.onHostVisible);
  }

  // ── Screen 1: intro / keep location on ──
  private renderIntro(body: HTMLElement): void {
    body.appendChild(badge('map-pin'));
    body.appendChild(title('Keep Location Services On', ''));
    body.appendChild(
      bullets([
        ['help-circle', 'Why do we need your address?', `As a registered business, ${this.businessName} is required to collect this information before verifying your account.`],
        ['home', 'Must be your home address', 'Please provide the address where you live. Not a P.O box or a post office address.'],
        ['map-pin', "We'll use your location data", "We need your location data to verify your address. Please choose 'Always Allow' till we complete the verification."],
        ['smile', 'Help us know you better', 'Verifying your address helps us provide better tailored service for you and your business.'],
      ]),
    );
    body.appendChild(this.cta('Continue', () => { this.stage = 'collab'; this.render(); }));
  }

  // ── Screen 2: business collaboration consent (accordion) ──
  private renderCollab(body: HTMLElement): void {
    body.appendChild(logoLockup(this.business.logoUrl));
    const lead = el('div', 'iq-collab-lead');
    lead.innerHTML = `<strong>${escapeHtml(this.businessName)}</strong> uses <strong>AddressIQ</strong> to collect, verify, and update your addresses.`;
    body.appendChild(lead);

    const card = el('div', 'iq-accordion');
    ACCORDION.forEach((item, i) => {
      const section = el('div', 'iq-acc-item');
      const head = el('button', 'iq-acc-head');
      head.innerHTML = `<span class="iq-acc-icon">${svgIcon(item.icon, 20)}</span><span class="iq-acc-title">${escapeHtml(item.heading)}</span><span class="iq-acc-caret">${svgIcon(i === this.openAccordion ? 'chevron-up' : 'chevron-down', 18)}</span>`;
      head.onclick = () => { this.openAccordion = this.openAccordion === i ? -1 : i; this.render(); };
      section.appendChild(head);
      if (i === this.openAccordion) {
        const b = el('div', 'iq-acc-body');
        b.textContent = item.body(this.businessName);
        section.appendChild(b);
      }
      card.appendChild(section);
    });
    body.appendChild(card);

    const links = el('div', 'iq-links');
    links.innerHTML = 'Read our full <a href="https://addressiqpro.com/terms" target="_blank" rel="noopener">Terms</a> and <a href="https://addressiqpro.com/privacy" target="_blank" rel="noopener">Privacy Policy</a>';
    body.appendChild(links);
    body.appendChild(this.cta('Continue', () => { this.stage = 'live'; this.render(); }));
  }

  // ── Screen 3: verify where you currently live ──
  private renderLive(body: HTMLElement): void {
    body.appendChild(badge('home'));
    body.appendChild(title('Verify where you currently live', ''));
    body.appendChild(
      bullets([
        ['map-pin', 'Enable location permissions', ''],
        ['search', "We periodically check if you're at home over the next few days", ''],
        ['radio', 'Keep background location services on during the verification', ''],
      ]),
    );
    const cta = this.cta(this.liveRequesting ? 'Checking…' : 'Continue', () => { void this.continueFromLive(); });
    if (this.liveRequesting) cta.querySelector('button')?.setAttribute('disabled', 'true');
    body.appendChild(cta);
  }

  /**
   * From "Verify where you currently live", run the host's precise-location
   * prompt (the OS dialog appears here). If that already yields Always + Precise
   * we proceed; otherwise we route to the "Location permission" Settings screen
   * to finish the job (Always can't be granted from a dialog on iOS/Android). A
   * plain browser (no native prompt) passes straight through.
   */
  private async continueFromLive(): Promise<void> {
    if (this.liveRequesting) return; // debounce concurrent taps
    const requestPermission = this.config.locationProvider.requestPermission;
    if (!requestPermission) {
      void this.enterBook();
      return;
    }
    this.liveRequesting = true;
    this.render(); // "Checking…" + disabled
    let grant: { foreground: boolean; background: boolean };
    try {
      grant = await requestPermission.call(this.config.locationProvider);
    } catch {
      grant = { foreground: false, background: false };
    }
    this.liveRequesting = false;
    this.permissionSatisfied = grant.foreground && grant.background;
    if (this.permissionSatisfied) {
      void this.enterBook();
      return;
    }
    // Needs Always (and/or precise) → the Settings-route screen finishes it.
    this.stage = 'permission';
    this.render();
    this.startPermissionPoll();
  }

  // ── Screen 3b: Location permission (Settings route — native shells only) ──
  private renderPermissionSettings(body: HTMLElement): void {
    const isIOS = this.config.platform !== 'android'; // default to iOS-style copy
    const alwaysLabel = isIOS ? 'Always' : 'Allow all the time';
    const preciseLabel = isIOS ? 'Precise Location' : 'Use precise location';
    // Where the Always/Precise controls live once Settings opens — so the user
    // knows the last navigation step (Settings lands on the app's root page).
    const locationPath = isIOS ? 'Location' : 'Permissions → Location';

    body.appendChild(badge('map-pin'));
    body.appendChild(title('Location permission', 'To accurately find and verify your address, we need your location permission.'));
    const instr = el('div', 'iq-perm-instr');
    instr.innerHTML =
      `Tap <strong>Open settings</strong>, open <strong>${escapeHtml(locationPath)}</strong>, ` +
      `then choose <strong>${escapeHtml(alwaysLabel)}</strong> and turn on <strong>${escapeHtml(preciseLabel)}</strong>.`;
    body.appendChild(instr);
    body.appendChild(this.settingsMockup(isIOS, alwaysLabel, preciseLabel));

    if (this.permissionSatisfied) {
      const ok = el('div', 'iq-perm-ok');
      ok.innerHTML = `${svgIcon('check', 18)}<span>Location permission set — you're good to go.</span>`;
      body.appendChild(ok);
    }

    const label = this.permissionSatisfied ? 'Continue' : 'Open settings';
    body.appendChild(this.cta(label, () => {
      if (this.permissionSatisfied) {
        this.stopPermissionPoll();
        void this.enterBook();
      } else {
        void this.openSettingsAndWatch();
      }
    }));
  }

  /** A lightweight visual of the OS location-permission screen (platform labels). */
  private settingsMockup(isIOS: boolean, alwaysLabel: string, preciseLabel: string): HTMLElement {
    const wrap = el('div', 'iq-mock');
    const opts = isIOS
      ? ['Never', 'Ask Next Time Or When I Share', 'While Using the App', alwaysLabel]
      : ["Don't allow", 'Ask every time', 'Allow only while using the app', alwaysLabel];
    const list = el('div', 'iq-mock-list');
    opts.forEach((o, i) => {
      const selected = i === opts.length - 1;
      const row = el('div', 'iq-mock-row' + (selected ? ' iq-mock-sel' : ''));
      const lbl = el('span', 'iq-mock-lbl');
      lbl.textContent = o;
      row.appendChild(lbl);
      if (selected) {
        const chk = el('span', 'iq-mock-chk');
        chk.innerHTML = svgIcon('check', 18);
        row.appendChild(chk);
      }
      list.appendChild(row);
    });
    wrap.appendChild(list);

    const toggle = el('div', 'iq-mock-toggle');
    const tl = el('span', 'iq-mock-lbl iq-mock-accent');
    tl.textContent = preciseLabel;
    const sw = el('span', 'iq-mock-switch');
    toggle.appendChild(tl);
    toggle.appendChild(sw);
    wrap.appendChild(toggle);
    return wrap;
  }

  /** Re-check permission when the app regains focus (back from Settings). */
  private onHostVisible = (): void => {
    if (this.stage === 'permission' && document.visibilityState !== 'hidden') {
      void this.recheckPermission();
    }
  };

  private async recheckPermission(): Promise<void> {
    const getState = this.config.locationProvider.getPermissionState;
    if (!getState) return;
    let s: { foreground: boolean; background: boolean } | undefined;
    try {
      s = await getState.call(this.config.locationProvider);
    } catch {
      return;
    }
    if (s && s.foreground && s.background && !this.permissionSatisfied) {
      this.permissionSatisfied = true;
      this.stopPermissionPoll();
      if (this.stage === 'permission') this.render(); // flip "Open settings" → "Continue"
    }
  }

  private async openSettingsAndWatch(): Promise<void> {
    try {
      await this.config.locationProvider.openSettings?.();
    } catch {
      // ignore — user can still enable it manually and we'll detect on return
    }
    // Return-from-settings is handled by onHostVisible + the poll.
  }

  private startPermissionPoll(): void {
    this.stopPermissionPoll();
    this.permissionPoll = setInterval(() => { void this.recheckPermission(); }, 2000);
  }

  private stopPermissionPoll(): void {
    if (this.permissionPoll) {
      clearInterval(this.permissionPoll);
      this.permissionPoll = null;
    }
  }

  // ── Screen 4: address book ("Which address do you want to verify?") ──
  private async enterBook(): Promise<void> {
    this.stopPermissionPoll();
    this.stage = 'book';
    this.busy = true;
    this.render();
    try {
      this.addresses = await this.config.listAddresses();
    } catch {
      this.addresses = [];
    }
    this.busy = false;
    // No saved addresses → skip the book entirely, straight to collect.
    if (this.addresses.length === 0) {
      this.mountCollect();
      return;
    }
    this.render();
  }

  private renderBook(body: HTMLElement): void {
    if (this.busy) {
      body.appendChild(spinner('Loading your addresses…'));
      return;
    }
    body.appendChild(title('Which address do you want to verify?', 'Use the address where you currently live'));

    const group = el('div', 'iq-book');
    const groupLabel = el('div', 'iq-book-label');
    groupLabel.textContent = 'My AddressIQ address book';
    group.appendChild(groupLabel);

    const list = el('div', 'iq-book-list');
    this.addresses.forEach((addr, i) => {
      const rowWrap = el('div', 'iq-book-row' + (i > 0 ? ' iq-book-sep' : ''));
      const info = el('div', 'iq-book-info');
      const name = el('div', 'iq-book-name');
      name.textContent = firstLine(addr.formattedAddress);
      const sub = el('div', 'iq-book-sub');
      sub.textContent = restLine(addr.formattedAddress);
      info.appendChild(name);
      info.appendChild(sub);
      const verify = button('Verify', 'iq-primary iq-book-verify');
      verify.onclick = () => { if (!this.busy) void this.verifyExisting(addr); };
      rowWrap.appendChild(info);
      rowWrap.appendChild(verify);
      list.appendChild(rowWrap);
    });
    group.appendChild(list);
    body.appendChild(group);

    const newBtn = button('Verify a new address', 'iq-outline');
    newBtn.onclick = () => this.mountCollect();
    body.appendChild(newBtn);
  }

  /** Terminal path: verify an existing saved address, then success. No collect steps. */
  private async verifyExisting(addr: SavedAddress): Promise<void> {
    this.busy = true;
    this.render();
    try {
      await this.config.startVerification(addr.locationCode);
      this.stage = 'success';
    } catch {
      // startVerification already surfaced the error; return to the book.
      this.stage = 'book';
    }
    this.busy = false;
    this.render();
  }

  // ── Collect sub-flow (new address only) ──
  private mountCollect(): void {
    this.stage = 'collect';
    this.mount.innerHTML = '';
    const form = new CollectForm(
      this.mount,
      {
        googleMapsApiKey: this.googleMapsApiKey,
        theme: this.config.theme,
        locationProvider: this.config.locationProvider,
        business: this.business,
        fetchCountries: this.config.fetchCountries,
        fetchStates: this.config.fetchStates,
      },
      this.config.submit,
      () => this.config.onClose(),
      (_address: AddressData) => { this.stage = 'success'; this.render(); },
    );
    void form.start();
  }

  // ── Final success ──
  private renderSuccess(body: HTMLElement): void {
    body.appendChild(badge('check'));
    body.appendChild(title('Verification started', "Keep your location services on for the duration of the verification. We'll email you when it's complete."));
    body.appendChild(this.cta('Continue', () => this.config.onClose()));
  }

  private cta(labelText: string, onClick: () => void): HTMLElement {
    const f = el('div', 'iq-footer');
    const btn = button(this.busy ? 'Please wait…' : labelText, 'iq-primary');
    btn.onclick = () => { if (!this.busy) onClick(); };
    f.appendChild(btn);
    return f;
  }
}

/**
 * Resolve business branding. The backend (tenant behind the API key) is
 * authoritative; each non-empty backend field wins, otherwise the client-supplied
 * fallback is used. Prevents a hardcoded integrator name from overriding the real
 * business identity.
 */
function mergeBusiness(client: BusinessBranding | undefined, remote: BusinessBranding | null): BusinessBranding {
  const c: Partial<BusinessBranding> = client ?? {};
  const r: Partial<BusinessBranding> = remote ?? {};
  const pick = (a?: string, b?: string) => (a && a.trim() ? a : b) ?? '';
  return {
    displayName: pick(r.displayName, c.displayName),
    logoUrl: pick(r.logoUrl, c.logoUrl) || undefined,
    primaryColor: pick(r.primaryColor, c.primaryColor) || undefined,
    secondaryColor: pick(r.secondaryColor, c.secondaryColor) || undefined,
    borderRadius: r.borderRadius ?? c.borderRadius,
    buttonStyle: r.buttonStyle ?? c.buttonStyle,
    consentCopy: pick(r.consentCopy, c.consentCopy) || undefined,
    consentVersion: pick(r.consentVersion, c.consentVersion) || undefined,
  };
}

// ── Screen-building helpers ──

function bullets(items: [IconName, string, string][]): HTMLElement {
  const wrap = el('div', 'iq-bullets');
  items.forEach(([icon, head, sub]) => {
    const row = el('div', 'iq-bullet');
    const ic = el('div', 'iq-bullet-icon');
    ic.innerHTML = svgIcon(icon, 22);
    const txt = el('div', 'iq-bullet-txt');
    const h = el('div', 'iq-bullet-head');
    h.textContent = head;
    txt.appendChild(h);
    if (sub) {
      const s = el('div', 'iq-bullet-sub');
      s.textContent = sub;
      txt.appendChild(s);
    }
    row.appendChild(ic);
    row.appendChild(txt);
    wrap.appendChild(row);
  });
  return wrap;
}

function poweredBy(): HTMLElement {
  const p = el('div', 'iq-powered');
  p.innerHTML = 'Powered by <strong>AddressIQ</strong>';
  return p;
}

function logoLockup(logoUrl?: string): HTMLElement {
  const wrap = el('div', 'iq-lockup');
  if (logoUrl) {
    const img = document.createElement('img');
    img.src = logoUrl;
    img.className = 'iq-lockup-logo';
    img.alt = '';
    wrap.appendChild(img);
    const plus = el('span', 'iq-lockup-plus');
    plus.textContent = '+';
    wrap.appendChild(plus);
  }
  const aiq = el('span', 'iq-lockup-aiq');
  aiq.textContent = 'AddressIQ';
  wrap.appendChild(aiq);
  return wrap;
}

function badge(name: IconName): HTMLElement {
  const wrap = el('div', 'iq-badge-wrap');
  const b = el('div', 'iq-badge');
  b.innerHTML = svgIcon(name, 40);
  wrap.appendChild(b);
  return wrap;
}

function spinner(text: string): HTMLElement {
  const wrap = el('div', 'iq-loading');
  wrap.appendChild(el('div', 'iq-spinner'));
  const t = el('div', 'iq-sub');
  t.textContent = text;
  wrap.appendChild(t);
  return wrap;
}

function firstLine(addr: string): string {
  const parts = addr.split(',');
  return (parts[0] ?? addr).trim();
}
function restLine(addr: string): string {
  const parts = addr.split(',');
  return parts.slice(1).join(',').trim();
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Flow-specific styles (collect-form's injectStyles provides the base set). */
function injectFlowStyles(): void {
  if (document.getElementById('iq-flow-styles')) return;
  const style = document.createElement('style');
  style.id = 'iq-flow-styles';
  style.textContent = `
.iq-badge-wrap{display:flex;justify-content:center;margin:8px 0}
.iq-badge{width:96px;height:96px;border-radius:50%;background:#eaf6ff;display:flex;align-items:center;justify-content:center;color:var(--iq-primary,#111827)}
.iq-bullets{display:flex;flex-direction:column;gap:20px;margin-top:8px}
.iq-bullet{display:flex;gap:14px;align-items:flex-start}
.iq-bullet-icon{flex:0 0 28px;display:flex;justify-content:center;color:var(--iq-primary,#111827)}
.iq-bullet-icon svg,.iq-badge svg,.iq-acc-icon svg,.iq-acc-caret svg{display:block}
.iq-bullet-head{font-size:16px;font-weight:700}
.iq-bullet-sub{font-size:14px;color:#6b7280;margin-top:2px}
.iq-powered{text-align:center;color:#9ca3af;font-size:13px;padding-top:12px}
.iq-perm-warn{background:#fff4ed;border:1px solid #ffd9c2;color:#9a3412;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.4}
.iq-perm-instr{font-size:15px;color:#374151;line-height:1.45}
.iq-perm-instr strong{color:var(--iq-primary,#ff6b35)}
.iq-mock{background:#eef0f3;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:12px}
.iq-mock-list,.iq-mock-toggle{background:#fff;border-radius:12px;overflow:hidden}
.iq-mock-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #f0f1f3;color:#9ca3af;font-size:15px}
.iq-mock-list .iq-mock-row:last-child{border-bottom:0}
.iq-mock-sel .iq-mock-lbl{color:var(--iq-primary,#ff6b35);font-weight:700}
.iq-mock-chk{color:var(--iq-primary,#ff6b35);display:flex}
.iq-mock-toggle{display:flex;align-items:center;justify-content:space-between;padding:14px 16px}
.iq-mock-accent{color:var(--iq-primary,#ff6b35);font-weight:700}
.iq-mock-switch{width:40px;height:24px;border-radius:12px;background:var(--iq-primary,#ff6b35);position:relative;flex:0 0 auto}
.iq-mock-switch::after{content:"";position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:#fff}
.iq-perm-ok{display:flex;align-items:center;gap:8px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px;font-size:14px;font-weight:600}
.iq-perm-ok svg{flex:0 0 auto}
.iq-lockup{display:flex;align-items:center;justify-content:center;gap:8px;margin:8px 0;font-size:20px;font-weight:800}
.iq-lockup-logo{width:40px;height:40px;border-radius:10px;object-fit:cover}
.iq-lockup-plus{color:#9ca3af}
.iq-collab-lead{text-align:center;font-size:18px;line-height:1.4}
.iq-accordion{border:1px solid #e5e7eb;border-radius:16px;overflow:hidden}
.iq-acc-item{border-bottom:1px solid #f0f0f0}
.iq-acc-item:last-child{border-bottom:0}
.iq-acc-head{width:100%;display:flex;align-items:center;gap:12px;padding:16px;background:#fff;border:0;cursor:pointer;font-size:15px;font-weight:700;text-align:left}
.iq-acc-icon{display:flex;color:var(--iq-primary,#111827)}
.iq-acc-title{flex:1}
.iq-acc-caret{display:flex;color:#9ca3af}
.iq-acc-body{padding:0 16px 16px 44px;font-size:14px;color:#4b5563;line-height:1.5}
.iq-links{text-align:center;font-size:13px;color:#6b7280}
.iq-links a{color:#6b7280}
.iq-book{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden}
.iq-book-label{background:#d9f6e6;color:#0f766e;font-weight:700;font-size:15px;padding:12px 16px}
.iq-book-list{display:flex;flex-direction:column}
.iq-book-row{display:flex;align-items:center;gap:12px;padding:16px}
.iq-book-sep{border-top:1px solid #f0f0f0}
.iq-book-info{flex:1;min-width:0}
.iq-book-name{font-size:16px;font-weight:700}
.iq-book-sub{font-size:13px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iq-book-verify{flex:0 0 auto;width:auto;padding:10px 22px}
.iq-outline{width:100%;background:#fff;border:1px solid #d1d5db;color:#111827;margin-top:auto}
.iq-loading{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 0}
.iq-spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:var(--iq-primary,#ff6b35);border-radius:50%;animation:iqspin 0.8s linear infinite}
@keyframes iqspin{to{transform:rotate(360deg)}}
`;
  document.head.appendChild(style);
}
