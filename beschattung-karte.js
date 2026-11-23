// beschattung-karte v1.0.0
// Einzeln installierbares Modul (Home Assistant Marketplace / HACS, Kategorie Dashboard).
window.customCards = window.customCards || [];
window.customCardFeatures = window.customCardFeatures || [];
// Eigener Block: Namen bleiben lokal, auch wenn mehrere Karten zusammen geladen werden.
{
// Raffstore Lamellen-Stufen: Tile-Feature fuer Home Assistant
// Zeigt die Lamellenposition als Slider. Beim Verstellen rastet der Slider in feste Stufen ein
// (passend zu bLamellaSteps der SPS, Standard 7 Schritte = 8 Positionen 0..100 %).
// Anzeige: "exakt" = echter Wert der SPS, "stufe" = Wert wird auf die naechste Stufe gerundet angezeigt.
//
// Konfiguration in einer Tile-Karte:
//   features:
//     - type: custom:raffstore-lamellen-stufen
//       schritte: 7          # optional, Standard 7
//       anzeige: exakt       # optional: exakt | stufe
//       umgedreht: true      # optional, Standard true: Fuellung von rechts (100 % = offen = leerer Balken)

const TYPE = "raffstore-lamellen-stufen";
const SUPPORT_SET_TILT_POSITION = 128;

class RaffstoreLamellenStufen extends HTMLElement {
  setConfig(config) {
    if (!config) throw new Error("Ungueltige Konfiguration");
    const n = Number(config.schritte ?? 7);
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error("schritte muss eine ganze Zahl von 1 bis 50 sein");
    this._config = { schritte: n, anzeige: config.anzeige === "stufe" ? "stufe" : "exakt", umgedreht: config.umgedreht !== false };
    this._render();
  }

  set hass(hass) { this._hass = hass; this._update(); }
  set context(ctx) { this._context = ctx; this._update(); }
  set stateObj(s) { this._stateObj = s; this._update(); }   // aeltere HA-Versionen
  set color(c) { this._color = c; this._applyColor(); }      // Farbe der Tile-Karte

  _applyColor() {
    if (!this._slider) return;
    const c = this._color;
    if (!c || c === "state" || c === "none") {
      this._slider.style.removeProperty("--control-slider-color");
      this._slider.style.removeProperty("--control-slider-background");
      return;
    }
    const css = /^[a-z-]+$/.test(c) && c !== "primary" && c !== "accent" ? `var(--${c}-color)` : (c === "primary" || c === "accent" ? `var(--${c}-color)` : c);
    this._slider.style.setProperty("--control-slider-color", css);
    this._slider.style.setProperty("--control-slider-background", css);
  }

  get _entity() {
    const id = this._context?.entity_id;
    if (id && this._hass) return this._hass.states[id];
    return this._stateObj;
  }

  _stufen() {
    const n = this._config?.schritte ?? 7;
    return Array.from({ length: n + 1 }, (_, k) => (k * 100) / n);
  }

  _naechsteStufe(v) {
    const st = this._stufen();
    let best = 0;
    st.forEach((s, i) => { if (Math.abs(s - v) < Math.abs(st[best] - v)) best = i; });
    return best;
  }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const n = this._config.schritte;
    const ticks = Array.from({ length: n - 1 }, (_, i) => `<div class="tick" style="left:${((i + 1) * 100) / n}%"></div>`).join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .wrap { position: relative; height: var(--feature-height, 42px); }
        ha-control-slider {
          --control-slider-color: var(--feature-color);
          --control-slider-background: var(--feature-color);
          --control-slider-background-opacity: 0.2;
          --control-slider-thickness: var(--feature-height, 42px);
          --control-slider-border-radius: var(--feature-border-radius, 12px);
          height: 100%;
        }
        .tick {
          position: absolute; bottom: 6px; width: 2px; height: 8px; margin-left: -1px;
          background: var(--primary-text-color); opacity: 0.35; border-radius: 1px; pointer-events: none;
        }
        .label {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          font-size: 12px; font-weight: 500; color: var(--primary-text-color);
          opacity: 0.8; pointer-events: none; white-space: nowrap;
        }
      </style>
      <div class="wrap">
        <ha-control-slider tooltip-mode="never" min="0" max="100" step="${100 / n}" ${this._config.umgedreht ? "inverted" : ""}></ha-control-slider>
        ${ticks}
        <div class="label"></div>
      </div>`;
    this._slider = this.shadowRoot.querySelector("ha-control-slider");
    this._label = this.shadowRoot.querySelector(".label");
    this._slider.inverted = this._config.umgedreht;
    this._applyColor();
    this._slider.addEventListener("slider-moved", (ev) => {
      const v = ev.detail?.value;
      if (v == null || isNaN(v)) return;
      this._dragging = true;
      this._setLabel(v);
    });
    this._slider.addEventListener("value-changed", (ev) => {
      this._dragging = false;
      const v = ev.detail?.value;
      const e = this._entity;
      if (v == null || isNaN(v) || !e || !this._hass) return;
      const ziel = Math.round(this._stufen()[this._naechsteStufe(v)]);
      this._hass.callService("cover", "set_cover_tilt_position", { entity_id: e.entity_id, tilt_position: ziel });
    });
    this._update();
  }

  // Anzeige-Text: bei umgedreht zaehlen Stufe und Prozent ab "offen" = 0 (wie weit die Lamelle geschlossen ist)
  _text(v) {
    const n = this._config.schritte;
    const k = this._naechsteStufe(v);
    return this._config.umgedreht
      ? `Stufe ${n - k} · ${Math.round(100 - v)} %`
      : `Stufe ${k} · ${Math.round(v)} %`;
  }

  _setLabel(v) {
    if (!this._label) return;
    this._label.textContent = this._text(v);
  }

  _update() {
    if (!this._slider) return;
    const e = this._entity;
    if (!e) return;
    const raw = Number(e.attributes?.current_tilt_position);
    const verfuegbar = e.state !== "unavailable" && !isNaN(raw);
    this._slider.disabled = !verfuegbar;
    if (!verfuegbar) { this._label.textContent = ""; return; }
    if (this._dragging) return;
    const k = this._naechsteStufe(raw);
    const anzeige = this._config.anzeige === "stufe" ? this._stufen()[k] : raw;
    this._slider.value = anzeige;
    this._slider.label = e.attributes?.friendly_name ? `${e.attributes.friendly_name} Lamelle` : "Lamelle";
    this._label.textContent = this._text(raw);
  }

  static getStubConfig() { return { type: `custom:${TYPE}`, schritte: 7, anzeige: "exakt", umgedreht: true }; }
}

if (!customElements.get(TYPE)) customElements.define(TYPE, RaffstoreLamellenStufen);

if (!window.customCardFeatures.some((f) => f.type === TYPE)) {
  window.customCardFeatures.push({
    type: TYPE,
    name: "Raffstore Lamellen-Stufen",
    configurable: true,
    supported: (stateObj) =>
      stateObj?.entity_id?.startsWith("cover.") &&
      ((stateObj.attributes?.supported_features ?? 0) & SUPPORT_SET_TILT_POSITION) !== 0,
  });
}

// ---------------------------------------------------------------------------
// Beschattung Steuerung: Automatik-Taste + Auf / Stopp / Ab in einer Zeile
// (eine Tile-Karte zeigt inline nur ein Feature, deshalb alles in einem Element).
//
//   features_position: inline
//   features:
//     - type: custom:beschattung-steuerung
//       automatik: switch.essbereichtuer   # optional, ohne Eintrag keine Automatik-Taste

const TYPE2 = "beschattung-steuerung";

class BeschattungSteuerung extends HTMLElement {
  setConfig(config) {
    if (!config) throw new Error("Ungueltige Konfiguration");
    if (config.automatik && !String(config.automatik).startsWith("switch.") && !String(config.automatik).startsWith("input_boolean."))
      throw new Error("automatik muss eine switch- oder input_boolean-Entitaet sein");
    this._config = { automatik: config.automatik || null };
    this._render();
  }

  set hass(hass) { this._hass = hass; this._update(); }
  set context(ctx) { this._context = ctx; this._update(); }
  set stateObj(s) { this._stateObj = s; this._update(); }
  set color(c) { this._color = c; this._update(); }

  get _entity() {
    const id = this._context?.entity_id;
    if (id && this._hass) return this._hass.states[id];
    return this._stateObj;
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const auto = this._config.automatik
      ? `<ha-control-button class="auto" data-a="auto"><ha-icon icon="mdi:window-shutter-auto"></ha-icon></ha-control-button>`
      : "";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-control-button-group {
          --control-button-group-spacing: var(--beschattung-tasten-abstand, 12px);
          --control-button-group-thickness: var(--feature-height, 42px);
          height: var(--feature-height, 42px);
        }
        ha-control-button {
          --control-button-border-radius: var(--feature-border-radius, 12px);
          --control-button-padding: 0;
        }
        ha-control-button.auto.an {
          --control-button-icon-color: var(--green-color, #4caf50);
          --control-button-background-color: var(--green-color, #4caf50);
          --control-button-background-opacity: 0.25;
        }
        ha-control-button.auto:not(.an) { --control-button-icon-color: var(--disabled-text-color); }
      </style>
      <ha-control-button-group>
        ${auto}
        <ha-control-button data-a="open"><ha-icon icon="mdi:arrow-up"></ha-icon></ha-control-button>
        <ha-control-button data-a="stop"><ha-icon icon="mdi:stop"></ha-icon></ha-control-button>
        <ha-control-button data-a="close"><ha-icon icon="mdi:arrow-down"></ha-icon></ha-control-button>
      </ha-control-button-group>`;
    this._btn = {};
    this.shadowRoot.querySelectorAll("ha-control-button").forEach((b) => {
      this._btn[b.dataset.a] = b;
      b.addEventListener("click", (ev) => { ev.stopPropagation(); this._klick(b.dataset.a); });
    });
    this._update();
  }

  _klick(a) {
    const e = this._entity;
    if (!this._hass) return;
    if (a === "auto") {
      if (this._config.automatik) this._hass.callService(this._config.automatik.split(".")[0], "toggle", { entity_id: this._config.automatik });
      return;
    }
    if (!e) return;
    const svc = { open: "open_cover", stop: "stop_cover", close: "close_cover" }[a];
    this._hass.callService("cover", svc, { entity_id: e.entity_id });
  }

  _update() {
    if (!this._btn) return;
    const e = this._entity;
    if (!e) return;
    const weg = e.state === "unavailable";
    const pos = e.attributes?.current_position;
    const ganzOffen = pos != null ? pos >= 100 : e.state === "open";
    const ganzZu = pos != null ? pos <= 0 : e.state === "closed";
    this._btn.open.disabled = weg || (ganzOffen && e.state !== "closing") || e.state === "opening";
    this._btn.close.disabled = weg || (ganzZu && e.state !== "opening") || e.state === "closing";
    this._btn.stop.disabled = weg;
    this._btn.open.label = "Auf";
    this._btn.stop.label = "Stopp";
    this._btn.close.label = "Ab";
    if (this._btn.auto && this._hass) {
      const s = this._hass.states[this._config.automatik];
      const an = s?.state === "on";
      this._btn.auto.classList.toggle("an", an);
      this._btn.auto.disabled = !s || s.state === "unavailable";
      this._btn.auto.label = an ? "Automatik an" : "Automatik aus";
      this._btn.auto.title = an ? "Automatik an" : "Automatik aus";
    }
  }

  static getStubConfig() { return { type: `custom:${TYPE2}` }; }
}

if (!customElements.get(TYPE2)) customElements.define(TYPE2, BeschattungSteuerung);
if (!window.customCardFeatures.some((f) => f.type === TYPE2)) {
  window.customCardFeatures.push({
    type: TYPE2,
    name: "Beschattung Steuerung (Automatik + Auf/Stopp/Ab)",
    configurable: true,
    supported: (stateObj) => stateObj?.entity_id?.startsWith("cover."),
  });
}

// ---------------------------------------------------------------------------
// Beschattung Karte: eine Tile-Karte mit Positions- und Lamellen-Slider,
// die Tasten (Automatik, Auf, Stopp, Ab) stehen rechts in der Kopfzeile neben dem Namen.
//
//   type: custom:beschattung-karte
//   entity: cover.essbereichtuer
//   name: Essbereich Tuer            # optional
//   color: purple                    # optional
//   automatik: switch.essbereichtuer # optional
//   lamellen: true                   # optional, Standard: true wenn die Beschattung Lamellen hat
//   schritte: 7                      # optional, Lamellenstufen

const TYPE3 = "beschattung-karte";
const TASTE_NORMAL = 48, ABSTAND_NORMAL = 12, TASTE_KOMPAKT = 36, ABSTAND_KOMPAKT = 6;

class BeschattungKarte extends HTMLElement {
  setConfig(config) {
    if (!config?.entity || !String(config.entity).startsWith("cover.")) throw new Error("entity (cover.*) fehlt");
    this._config = { ...config };
    this._modus = null;
    this._pruefen();
  }

  set hass(hass) {
    const erst = !this._hass;
    this._hass = hass;
    if (this._tile) this._tile.hass = hass;
    if (this._steu) this._steu.hass = hass;
    if (erst || !this._tile) this._pruefen();
  }

  connectedCallback() {
    if (!this._ro) this._ro = new ResizeObserver(() => this._pruefen());
    this._ro.observe(this);
    this._pruefen();
  }
  disconnectedCallback() { this._ro?.disconnect(); }

  _mitLamellen() {
    if (this._config.lamellen === false) return false;
    if (this._config.lamellen === true) return true;
    const s = this._hass?.states[this._config.entity];
    return !!s && ((s.attributes?.supported_features ?? 0) & 128) !== 0;
  }

  _anzahlTasten() { return this._config.automatik ? 4 : 3; }

  // Breite des Namens schaetzen, damit die Tasten nicht ueber dem Text liegen
  _namensBreite() {
    const s = this._hass?.states[this._config.entity];
    const name = this._config.name || s?.attributes?.friendly_name || this._config.entity;
    const cv = this._cv || (this._cv = document.createElement("canvas"));
    const ctx = cv.getContext("2d");
    const font = getComputedStyle(this).fontFamily || "Roboto, sans-serif";
    ctx.font = `500 14px ${font}`;
    return ctx.measureText(name).width;
  }

  _pruefen() {
    if (!this._config || !this._hass) return;
    const breite = this.getBoundingClientRect().width;
    if (!breite) { if (!this._tile) this._bauen("unten", 0); return; }
    // links: Rand 10 + Symbol 36 + Abstand 10 + Name + 12 Luft; rechts: Rand 12
    const frei = breite - (10 + 36 + 10 + this._namensBreite() + 12) - 12;
    const n = this._anzahlTasten();
    const normal = n * TASTE_NORMAL + (n - 1) * ABSTAND_NORMAL;
    const kompakt = n * TASTE_KOMPAKT + (n - 1) * ABSTAND_KOMPAKT;
    let modus, b = 0;
    if (frei >= normal) { modus = "normal"; b = Math.min(frei, 360); }
    else if (frei >= kompakt) { modus = "kompakt"; b = frei; }
    else modus = "unten";
    if (modus !== this._modus) this._bauen(modus, b);
    else if (this._tasten && modus !== "unten") this._tasten.style.width = `${b}px`;
  }

  async _bauen(modus, b) {
    if (this._baut) { this._nochmal = true; return; }
    this._baut = true;
    try {
      const c = this._config;
      const helpers = await window.loadCardHelpers();
      const features = [];
      if (modus === "unten") features.push({ type: `custom:${TYPE2}`, automatik: c.automatik });
      features.push({ type: "cover-position" });
      if (this._mitLamellen()) features.push({ type: `custom:${TYPE}`, schritte: c.schritte ?? 7, anzeige: c.anzeige ?? "exakt" });
      const tileCfg = {
        type: "tile", entity: c.entity, hide_state: true, show_entity_picture: false, vertical: false,
        features_position: "bottom", features,
      };
      if (c.name) tileCfg.name = c.name;
      if (c.color) tileCfg.color = c.color;
      if (c.icon) tileCfg.icon = c.icon;
      const tile = helpers.createCardElement(tileCfg);
      tile.hass = this._hass;

      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          .wrap { position: relative; height: 100%; }
          .tasten {
            position: absolute; top: 7px; right: 12px;
            --feature-height: 42px; --feature-border-radius: 12px;
          }
          .tasten.kompakt { --beschattung-tasten-abstand: ${ABSTAND_KOMPAKT}px; }
        </style>
        <div class="wrap"></div>`;
      const wrap = this.shadowRoot.querySelector(".wrap");
      wrap.appendChild(tile);
      this._tile = tile;
      this._steu = null;
      this._tasten = null;

      if (modus !== "unten") {
        const tasten = document.createElement("div");
        tasten.className = `tasten ${modus}`;
        tasten.style.width = `${b}px`;
        const steu = document.createElement(TYPE2);
        steu.setConfig({ automatik: c.automatik });
        steu.color = c.color;
        steu.context = { entity_id: c.entity };
        steu.stateObj = this._hass.states[c.entity];
        steu.hass = this._hass;
        tasten.appendChild(steu);
        wrap.appendChild(tasten);
        this._steu = steu;
        this._tasten = tasten;
      }
      this._modus = modus;
    } finally {
      this._baut = false;
      if (this._nochmal) { this._nochmal = false; this._pruefen(); }
    }
  }

  getCardSize() { return this._mitLamellen() ? 4 : 3; }
  // Hoehe richtet sich nach dem Inhalt (keine festen Rasterzeilen, sonst bleibt darunter Leerraum)
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
  static getStubConfig(hass) {
    const e = Object.keys(hass?.states ?? {}).find((id) => id.startsWith("cover.")) ?? "cover.beispiel";
    return { entity: e };
  }
}

if (!customElements.get(TYPE3)) customElements.define(TYPE3, BeschattungKarte);
if (!window.customCards.some((c) => c.type === TYPE3)) {
  window.customCards.push({ type: TYPE3, name: "Beschattung Karte", description: "Raffstore/Rollladen mit Automatik, Auf/Stopp/Ab und Lamellenstufen" });
}

// Eingabemaske (visueller Editor) und Startwerte
{
  const ids = (hass) => Object.keys(hass?.states ?? {});
  const finde = (hass, re, dom = "sensor.") => ids(hass).find((id) => id.startsWith(dom) && re.test(id)) || "";
  const ent = (domain, extra = {}) => ({ entity: { filter: { domain, ...extra } } });
  const nummer = (min, max, step = 1, unit) => ({ number: { min, max, step, mode: "box", ...(unit ? { unit_of_measurement: unit } : {}) } });
  const auswahl = (opts) => ({ select: { mode: "dropdown", options: opts.map(([value, label]) => ({ value, label })) } });
  const text = { text: {} };
  const formular = (schema, labels, hilfen = {}) => () => ({
    schema,
    computeLabel: (s) => labels[s.name] ?? s.name,
    computeHelper: (s) => hilfen[s.name],
  });
  const setze = (typ, form, stub) => {
    const K = customElements.get(typ);
    if (!K) return;
    if (form) K.getConfigForm = form;
    if (stub) K.getStubConfig = (hass) => Object.fromEntries(Object.entries(stub(hass)).filter(([, v]) => v !== ""));
  };
  setze("beschattung-karte",
    formular([
      { name: "entity", required: true, selector: ent("cover") },
      { name: "name", selector: text },
      { name: "automatik", selector: ent(["switch", "input_boolean"]) },
    ], { entity: "Raffstore / Rollladen", name: "Name (optional)", automatik: "Automatik-Schalter (optional)" }),
    null);
}
}

console.info("%c beschattung-karte %c v1.0.0 ", "color:#fff;background:#03a9f4;font-weight:700", "color:#03a9f4");
