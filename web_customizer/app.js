/**
 * ============================================================================
 * SURF CLOCK — 3D STUDIO CUSTOMIZER CONTROLLER
 * Clean NikeID-style UX + Real-Time 3D Customizer + Google Maps-Style Autocomplete
 * + Interactive Explode Slider + Live 3D Z-Space Oceanographic Wave Telemetry
 * ============================================================================
 */

import { COMPONENT_SWATCHES, CURATED_EDITIONS } from "./materials_and_presets.js?v=42";
import {
  DIAL_SLOTS,
  CURATED_REGIONS,
  ALL_KNOWN_REGIONS,
  formatDialBeachName,
  resolve5BestLocalBeaches,
  fetchLiveMarineTelemetry,
  searchLocationsAutocomplete,
} from "./surf_data.js?v=42";
import { SurfClockStudio3D } from './studio_3d.js?v=42';

const PART_LABELS = {
  bezel: "Outer Frame",
  dial: "Dial Face",
  inlay: "Typography",
  hands: "Clock Hands",
  deck: "Internal Core",
};

const EDITION_ACCENT_HEX = {
  "gallery-alabaster": "#FF4F00",
  "braun-dn40": "#FF4F00",
  "eucalyptus-sage": "#5E7153",
  "klein-cobalt": "#0D38C4",
  "signal-1972": "#EB3900",
  "obsidian-gold": "#C59B38",
  "skeleton-frost": "#0284C7",
  "smoked-amber": "#DF852C",
};

class SurfClockConfiguratorApp {
  constructor() {
    const defaultRegion = CURATED_REGIONS[0];
    const defaultEdition = CURATED_EDITIONS[0];

    this.state = {
      activeRegion: { ...defaultRegion },
      beaches: defaultRegion.beaches.map((b) => ({ ...b })),
      selectedBeachIndex: defaultRegion.activeSlot ?? 2,
      bestBeachIndex: defaultRegion.activeSlot ?? 2,
      conditionsRating: defaultRegion.worthItScore ?? 8.2,
      activeSwellHeightM: defaultRegion.swellHeightM ?? 1.9,
      activeSwellPeriodS: defaultRegion.swellPeriodS ?? 13,
      activeSwellDir: defaultRegion.swellDir || "SSE",
      subdialMode: defaultEdition.subdialMode || "worth_it",

      activePart: "bezel",
      activeEditionId: defaultEdition.id,
      colors: {
        bezel: defaultEdition.bezel,
        dial: defaultEdition.dial,
        inlay: defaultEdition.inlay,
        hands: defaultEdition.hands,
        deck: defaultEdition.deck,
      },

      lightingMode: "daylight",
      cameraView: "front",
      explodeFactor: 0,
      liveDemoRunning: false,

      autocompleteItems: [],
      autocompleteIndex: -1,
    };

    this.demoTimer = null;
    this.searchDebounce = null;
    this.toastTimeout = null;
    this.loadingTimeout = null;
    this._acSeq = 0;
    this._regionSeq = 0;

    if (window.innerWidth === 500 && window.innerHeight === 844) {
      document.documentElement.classList.add("mobile-390-preview");
      document.body.classList.add("mobile-390-preview");
    }
    this._initDOMRefs();
    this._recomputeActiveBeachConditions();
    this._init3DEngine();
    this._renderRegionPills();
    this._renderBeachesList();
    this._renderPresetChips();
    this._renderSwatchGrid();
    this._updateAllLabels();
    this._bindEvents();
    this._startHudWaveLoop();
    this._applyDemoQueryHooks();
  }

  _recomputeActiveBeachConditions() {
    const reg = this.state.activeRegion;
    const beach = this.state.beaches[this.state.selectedBeachIndex];
    const baseHeight = reg.swellHeightM ?? 1.9;
    const basePeriod = reg.swellPeriodS ?? 13;
    const baseDir = reg.swellDir || "SSE";

    let rating = reg.worthItScore ?? 8.2;
    if (beach && typeof beach.quality === "number") {
      rating = beach.quality;
    }
    this.state.conditionsRating = rating;

    // Subtle exposure factor per beach slot so selecting different beaches reflects break exposure
    const exposureFactors = [0.95, 0.88, 1.0, 0.82, 0.91];
    const exp = exposureFactors[this.state.selectedBeachIndex % 5] || 1.0;
    const qualityMod = 0.85 + (rating / 10) * 0.22;
    this.state.activeSwellHeightM = Number(Math.max(0.4, baseHeight * exp * qualityMod).toFixed(1));
    this.state.activeSwellPeriodS = Math.round(basePeriod);
    this.state.activeSwellDir = baseDir;
  }

  _applyDemoQueryHooks() {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");
    if (!demo) return;
    if (demo === "mobile" || demo === "mobile_drawer") {
      document.documentElement.classList.add("mobile-390-preview");
      document.body.classList.add("mobile-390-preview");
      if (demo === "mobile_drawer") {
        this.openMobileDrawer("colors");
      }
      setTimeout(() => { if (this.studio) { this.studio.resize(); this.studio.setCameraPreset("front", true); } }, 50);
    } else if (demo === "kiama") {
      const kiamaReg = ALL_KNOWN_REGIONS.find((r) => r.id === "kiama-south-coast");
      if (kiamaReg) {
        this.dom.searchInput.value = kiamaReg.name;
        this.selectRegionPreset(kiamaReg, true);
      }
    } else if (demo === "search") {
      this.dom.searchInput.value = "Kiama";
      this._updateAutocompleteSuggestions("Kiama");
    } else if (demo === "loading") {
      this.showLoadingOverlay("Loading 5 Best Beaches...", "Analyzing coast geometry & live Open-Meteo swell for Byron Bay, NSW");
    } else if (demo === "explode") {
      if (this.dom.sliderExplode) {
        this.dom.sliderExplode.value = "0.95";
      }
      this.state.explodeFactor = 0.95;
      this.state.cameraView = "exploded";
      this.dom.camBtns.forEach((b) => b.classList.toggle("active", b.dataset.cam === "exploded"));
      this.studio.setCameraPreset("exploded", true);
      this.studio.setExplodeFactor(0.95, true);
    } else if (demo === "night" || demo === "slate") {
      if (demo === "slate") {
        const ed = CURATED_EDITIONS[1];
        if (ed) this.applyEdition(ed);
      }
      this.setLightingMode("nightlight");
    } else if (demo === "surprise") {
      const ed = CURATED_EDITIONS.find((e) => e.id === "klein-cobalt") || CURATED_EDITIONS[3];
      if (ed) this.applyEdition(ed);
    } else if (demo === "subdial") {
      this.state.cameraView = "subdial";
      this.dom.camBtns.forEach((b) => b.classList.toggle("active", b.dataset.cam === "subdial"));
      if (this.dom.swellScaleDatum) this.dom.swellScaleDatum.classList.add("macro-hidden");
      this.studio.setCameraPreset("subdial", true);
    } else if (demo === "macro") {
      this.state.cameraView = "macro";
      this.dom.camBtns.forEach((b) => b.classList.toggle("active", b.dataset.cam === "macro"));
      if (this.dom.swellScaleDatum) this.dom.swellScaleDatum.classList.add("macro-hidden");
      this.studio.setCameraPreset("macro", true);
    }
  }

  _initDOMRefs() {
    this.dom = {
      viewportStage: document.getElementById("viewport-stage"),
      studioCanvas: document.getElementById("studio-canvas"),

      brandEasterEgg: document.getElementById("brand-easter-egg"),

      hudWaveCanvas: document.getElementById("hud-wave-canvas"),
      hudRegionTitle: document.getElementById("hud-region-title"),
      hudSwellSummary: document.getElementById("hud-swell-summary"),
      hudSwellHeroCard: document.getElementById("hud-swell-hero-card"),
      hudSwellSize: document.getElementById("hud-swell-size"),
      hudSwellFeet: document.getElementById("hud-swell-feet"),
      hudSwellPeriod: document.getElementById("hud-swell-period"),
      stageStatusPill: document.getElementById("stage-status-pill"),
      btnMobileSearchTrigger: document.getElementById("btn-mobile-search-trigger"),
      swellScaleDatum: document.getElementById("swell-scale-datum"),
      datumCaliperLine: document.getElementById("datum-caliper-line"),
      datumSwellVal: document.getElementById("datum-swell-val"),
      datumSwellSub: document.getElementById("datum-swell-sub"),
      customizerPanel: document.getElementById("customizer-panel"),
      btnMobileDrawerToggle: document.getElementById("btn-mobile-drawer-toggle"),
      btnMobileDrawerClose: document.getElementById("btn-mobile-drawer-close"),
      mobileDrawerSummary: document.getElementById("mobile-drawer-summary"),
      mdTabs: document.querySelectorAll(".md-tab"),

      loadingOverlay: document.getElementById("viewport-loading-overlay"),
      loadingTitle: document.getElementById("loading-overlay-title"),
      loadingSub: document.getElementById("loading-overlay-sub"),

      toastPill: document.getElementById("stage-toast-pill"),
      toastText: document.getElementById("stage-toast-text"),

      searchContainer: document.getElementById("search-container"),
      searchInput: document.getElementById("location-search-input"),
      btnSearchClear: document.getElementById("btn-search-clear"),
      autocompleteDropdown: document.getElementById("search-autocomplete-dropdown"),
      beachesStatusBadge: document.getElementById("beaches-status-badge"),
      regionPillsContainer: document.getElementById("region-pills-container"),
      beachesList: document.getElementById("beaches-list"),

      presetsRow: document.getElementById("presets-row"),
      partTabs: document.querySelectorAll(".part-tab"),
      swatchGrid: document.getElementById("swatch-grid"),
      activeSwatchLabel: document.getElementById("active-swatch-label"),
      btnSurpriseColor: document.getElementById("btn-surprise-color"),

      subdialBtns: document.querySelectorAll(".seg-btn"),
      sliderCondVal: document.getElementById("slider-cond-val"),
      ltBeachName: document.getElementById("lt-beach-name"),
      ltSwellSize: document.getElementById("lt-swell-size"),
      ltSwellPeriod: document.getElementById("lt-swell-period"),
      ltVerdictText: document.getElementById("lt-verdict-text"),

      lightBtns: document.querySelectorAll(".light-pill"),
      camBtns: document.querySelectorAll(".cam-btn[data-cam]"),
      sliderExplode: document.getElementById("slider-explode"),
      btnLiveDemo: document.getElementById("btn-live-demo"),

      btnOrder: document.getElementById("btn-order"),
      btnTopDownload: document.getElementById("btn-top-download"),
      btnQuickExportStl: document.getElementById("btn-quick-export-stl"),
      btnQuickExportFw: document.getElementById("btn-quick-export-fw"),

      modalBackdrop: document.getElementById("order-modal-backdrop"),
      btnModalClose: document.getElementById("btn-modal-close"),
      modalSummaryCard: document.getElementById("modal-summary-card"),
      btnExportCustomDialStl: document.getElementById("btn-export-custom-dial-stl"),
      btnDownloadFirmware: document.getElementById("btn-download-firmware"),
      btnDownloadWorkerJs: document.getElementById("btn-download-worker-js"),
      btnDownloadGuide: document.getElementById("btn-download-guide"),
    };
  }

  _init3DEngine() {
    this.studio = new SurfClockStudio3D(this.dom.studioCanvas, {
      onBeachClick: (slotIdx) => {
        this.selectBeachIndex(slotIdx);
        const bName = this.state.beaches[slotIdx]?.name || "BEACH";
        this.showToast(`📍 Pointing to ${bName}`);
      },
      onExplodeChange: (fac) => {
        this.state.explodeFactor = fac;
        if (this.dom.sliderExplode) {
          this.dom.sliderExplode.value = String(fac.toFixed(2));
        }
      },
      onReady: () => {
        this._syncAllToStudio();
        this._applyDemoQueryHooks();
      },
    });
    this._syncAllToStudio();
  }

  showLoadingOverlay(title = "Loading 5 Best Beaches...", subtitle = "Scanning coastline & live Open-Meteo marine swell") {
    if (!this.dom.loadingOverlay) return;
    if (this.dom.loadingTitle) this.dom.loadingTitle.textContent = title;
    if (this.dom.loadingSub) this.dom.loadingSub.textContent = subtitle;
    this.dom.loadingOverlay.classList.remove("hidden");
  }

  hideLoadingOverlay() {
    if (!this.dom.loadingOverlay) return;
    this.dom.loadingOverlay.classList.add("hidden");
  }

  showToast(message, durationMs = 2400) {
    if (!this.dom.toastPill || !this.dom.toastText) return;
    this.dom.toastText.textContent = message;
    this.dom.toastPill.classList.remove("hidden");
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.dom.toastPill.classList.add("hidden");
    }, durationMs);
  }

  setLightingMode(mode) {
    const normalized = mode === "nightlight" || mode === "dawn" ? "nightlight" : "daylight";
    this.state.lightingMode = normalized;
    this.dom.lightBtns.forEach((b) => {
      b.classList.toggle("active", b.dataset.light === normalized);
    });
    this.dom.viewportStage.classList.toggle("night-stage", normalized === "nightlight");
    if (this.studio) {
      this.studio.setLightingMode(normalized);
    }
  }

  _resolveKeyAccentHex(preferredPart = null) {
    if (!preferredPart && this.state.activeEditionId && EDITION_ACCENT_HEX[this.state.activeEditionId]) {
      return EDITION_ACCENT_HEX[this.state.activeEditionId];
    }
    const paleNeutrals = new Set([
      "#E8E3D9", "#CDC5B4", "#B8B2A8", "#EFECE4", "#F5F3ED", "#D6CBB8",
      "#ECE7DC", "#E4DCD0", "#D6CFC2", "#F2EFE9", "#EAE4D8", "#DDD6C8", "#F7F6F2", "#F4F1EA"
    ]);
    const checkOrder = preferredPart
      ? [preferredPart, "bezel", "hands", "dial", "deck", "inlay"]
      : ["bezel", "hands", "dial", "deck", "inlay"];

    for (const part of checkOrder) {
      const sw = this._getSwatchObj(part, this.state.colors[part]);
      if (sw && sw.hex && !paleNeutrals.has(sw.hex.toUpperCase())) {
        if (part === "inlay" && preferredPart !== "inlay") continue;
        return sw.hex;
      }
    }
    return "#FF4F00";
  }

  _syncSwellKeyColor(preferredPart = null, immediate = false) {
    const hex = this._resolveKeyAccentHex(preferredPart);
    this.state.activeAccentHex = hex;
    document.documentElement.style.setProperty("--swell-key-color", hex);
    if (this.studio && this.studio.setSwellAccentColor) {
      this.studio.setSwellAccentColor(hex, immediate);
    }
  }

  openMobileDrawer(tabId = null) {
    document.body.classList.add("mobile-drawer-open");
    if (this.dom.btnMobileDrawerToggle) {
      this.dom.btnMobileDrawerToggle.setAttribute("aria-expanded", "true");
    }
    if (tabId && this.dom.customizerPanel) {
      this.dom.customizerPanel.dataset.activeMdtab = tabId;
      if (this.dom.mdTabs) {
        this.dom.mdTabs.forEach((t) => t.classList.toggle("active", t.dataset.mdtab === tabId));
      }
    }
  }

  closeMobileDrawer() {
    document.body.classList.remove("mobile-drawer-open");
    if (this.dom.btnMobileDrawerToggle) {
      this.dom.btnMobileDrawerToggle.setAttribute("aria-expanded", "false");
    }
  }

  toggleMobileDrawer() {
    if (document.body.classList.contains("mobile-drawer-open")) {
      this.closeMobileDrawer();
    } else {
      this.openMobileDrawer();
    }
  }

  _escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  _syncSubdialNeedle() {
    if (!this.studio) return;
    if (this.state.subdialMode === "swell") {
      const hM = Number(this.state.activeSwellHeightM) || 1.9;
      const mapped = Math.max(1.0, Math.min(10.0, 1.0 + (hM / 3.2) * 9.0));
      this.studio.setWorthItScore(mapped);
    } else {
      this.studio.setWorthItScore(this.state.conditionsRating);
    }
  }

  _syncAllToStudio() {
    if (!this.studio) return;
    for (const part of ["bezel", "dial", "inlay", "hands", "deck"]) {
      this.studio.setComponentSwatch(part, this.state.colors[part]);
    }
    const names = this.state.beaches.map((b) => b.name);
    this.studio.updateDialTypography(names, this.state.subdialMode, this.state.activeRegion.shortName);
    this.studio.pointToBeachSlot(this.state.selectedBeachIndex);
    this._syncSubdialNeedle();
    this._syncSwellKeyColor(null, true);
    this._syncTelemetryToStudio();
  }

  _syncTelemetryToStudio() {
    if (!this.studio || !this.studio.setSwellTelemetry) return;
    this.studio.setSwellTelemetry({
      swellHeightM: this.state.activeSwellHeightM,
      swellPeriodS: this.state.activeSwellPeriodS,
      swellDir: this.state.activeSwellDir,
      worthItScore: this.state.conditionsRating,
      activeBeachIndex: this.state.selectedBeachIndex,
    });
  }

  _getSwatchObj(part, swatchId) {
    const list = COMPONENT_SWATCHES[part] || [];
    return list.find((s) => s.id === swatchId) || list[0];
  }

  _renderRegionPills() {
    this.dom.regionPillsContainer.innerHTML = "";
    CURATED_REGIONS.slice(0, 6).forEach((region) => {
      const btn = document.createElement("button");
      btn.className = `region-pill ${region.id === this.state.activeRegion.id ? "active" : ""}`;
      btn.textContent = region.shortName;
      btn.addEventListener("click", () => this.selectRegionPreset(region));
      this.dom.regionPillsContainer.appendChild(btn);
    });
  }

  _renderBeachesList() {
    this.dom.beachesList.innerHTML = "";
    let bestIdx = 0;
    let bestQ = -1;
    this.state.beaches.forEach((b, i) => {
      const q = b.quality ?? 8.5;
      if (q > bestQ) {
        bestQ = q;
        bestIdx = i;
      }
    });
    this.state.bestBeachIndex = bestIdx;

    this.state.beaches.forEach((beach, idx) => {
      const isSelected = idx === this.state.selectedBeachIndex;
      const isBest = idx === bestIdx;
      const row = document.createElement("div");
      row.className = `beach-row ${isSelected ? "active-beach" : ""}`;

      const num = document.createElement("div");
      num.className = "beach-num";
      num.textContent = String(idx + 1).padStart(2, "0");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "beach-name-input";
      input.value = beach.name;
      input.maxLength = 13;
      input.setAttribute("aria-label", `Beach ${idx + 1} name`);

      input.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectBeachIndex(idx);
      });

      input.addEventListener("input", (e) => {
        const val = formatDialBeachName(e.target.value);
        this.state.beaches[idx].name = val || `BEACH ${idx + 1}`;
        this.studio.updateDialTypography(
          this.state.beaches.map((b) => b.name),
          this.state.subdialMode,
          this.state.activeRegion.shortName
        );
        this._updateAllLabels();
      });

      const tag = document.createElement("span");
      tag.className = "beach-point-tag";
      if (isSelected && isBest) {
        tag.textContent = "★ Best Now";
      } else if (isSelected) {
        tag.textContent = "Pointing";
      } else if (isBest) {
        tag.textContent = "Best Now";
      } else {
        tag.textContent = "Select";
      }

      row.addEventListener("click", () => {
        this.selectBeachIndex(idx);
      });

      row.appendChild(num);
      row.appendChild(input);
      row.appendChild(tag);
      this.dom.beachesList.appendChild(row);
    });
  }

  _renderPresetChips() {
    this.dom.presetsRow.innerHTML = "";
    CURATED_EDITIONS.forEach((edition) => {
      const chip = document.createElement("button");
      chip.className = `preset-chip ${edition.id === this.state.activeEditionId ? "active" : ""}`;

      const dots = document.createElement("span");
      dots.className = "preset-dots";
      [
        this._getSwatchObj("bezel", edition.bezel),
        this._getSwatchObj("dial", edition.dial),
        this._getSwatchObj("hands", edition.hands),
      ].forEach((sw) => {
        const dot = document.createElement("span");
        dot.className = "preset-dot";
        dot.style.background = sw ? sw.hex : "#ccc";
        dots.appendChild(dot);
      });

      const label = document.createElement("span");
      label.textContent = edition.name;

      chip.appendChild(dots);
      chip.appendChild(label);
      chip.addEventListener("click", () => this.applyEdition(edition));
      this.dom.presetsRow.appendChild(chip);
    });
  }

  _renderSwatchGrid() {
    this.dom.swatchGrid.innerHTML = "";
    const part = this.state.activePart;
    const list = COMPONENT_SWATCHES[part] || [];
    const activeId = this.state.colors[part];

    list.forEach((swatch) => {
      const btn = document.createElement("button");
      btn.className = `swatch-btn ${swatch.id === activeId ? "active" : ""} ${
        swatch.transmission ? "translucent-swatch" : ""
      }`;
      btn.style.backgroundColor = swatch.hex;
      btn.title = swatch.name;
      btn.setAttribute("aria-label", swatch.name);

      btn.addEventListener("click", () => {
        this.setPartSwatch(part, swatch.id);
      });

      this.dom.swatchGrid.appendChild(btn);
    });
  }

  selectRegionPreset(region, silentOverlay = false) {
    const seq = ++this._regionSeq;
    if (!silentOverlay) {
      this.showLoadingOverlay(
        `Loading 5 Best Beaches...`,
        `Calibrating dial & live swell for ${region.name}`
      );
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = setTimeout(() => {
        if (seq === this._regionSeq) this.hideLoadingOverlay();
      }, 460);
    }

    this.state.activeRegion = { ...region };
    this.state.beaches = region.beaches.map((b) => ({ ...b }));

    let bestIdx = region.activeSlot ?? 0;
    let maxQ = -1;
    this.state.beaches.forEach((b, i) => {
      if ((b.quality ?? 0) > maxQ) {
        maxQ = b.quality;
        bestIdx = i;
      }
    });
    this.state.selectedBeachIndex = bestIdx;
    this._recomputeActiveBeachConditions();

    this._renderRegionPills();
    this._renderBeachesList();
    this.studio.updateDialTypography(
      this.state.beaches.map((b) => b.name),
      this.state.subdialMode,
      region.shortName
    );
    this.studio.pointToBeachSlot(this.state.selectedBeachIndex);
    this._syncSubdialNeedle();
    if (this.studio.triggerWavePulse) {
      this.studio.triggerWavePulse(1.15);
    }
    this._syncTelemetryToStudio();
    this._updateAllLabels();
    this.dom.beachesStatusBadge.textContent = `5 breaks loaded for ${region.shortName}`;

    // Fetch live Open-Meteo swell in background
    fetchLiveMarineTelemetry(region.lat, region.lng).then((live) => {
      if (live && seq === this._regionSeq) {
        this.state.activeRegion.swellHeightM = live.swellHeightM;
        this.state.activeRegion.swellPeriodS = live.swellPeriodS;
        this.state.activeRegion.swellDir = live.swellDir;
        this._recomputeActiveBeachConditions();
        this._syncSubdialNeedle();
        this._syncTelemetryToStudio();
        this._updateAllLabels();
      }
    });
  }

  selectBeachIndex(idx) {
    this.state.selectedBeachIndex = idx;
    this._recomputeActiveBeachConditions();
    this._renderBeachesList();
    this.studio.pointToBeachSlot(idx);
    this._syncSubdialNeedle();
    if (this.studio.triggerWavePulse) {
      this.studio.triggerWavePulse(0.95);
    }
    this._syncTelemetryToStudio();
    this._updateAllLabels();
  }

  selectPart(part) {
    this.state.activePart = part;
    this.dom.partTabs.forEach((t) => {
      t.classList.toggle("active", t.dataset.part === part);
    });
    this._renderSwatchGrid();
    this._updateAllLabels();
  }

  setPartSwatch(part, swatchId) {
    this.state.colors[part] = swatchId;
    this.state.activeEditionId = "";
    this.studio.setComponentSwatch(part, swatchId);
    this._syncSwellKeyColor(part, false);
    this._renderPresetChips();
    this._renderSwatchGrid();
    this._updateAllLabels();
  }

  applyEdition(edition) {
    this.state.activeEditionId = edition.id;
    this.state.colors = {
      bezel: edition.bezel,
      dial: edition.dial,
      inlay: edition.inlay,
      hands: edition.hands,
      deck: edition.deck,
    };
    if (edition.subdialMode && edition.subdialMode !== this.state.subdialMode) {
      this.state.subdialMode = edition.subdialMode;
      this.dom.subdialBtns.forEach((b) => b.classList.toggle("active", b.dataset.submode === this.state.subdialMode));
      this.studio.updateDialTypography(
        this.state.beaches.map((b) => b.name),
        this.state.subdialMode,
        this.state.activeRegion.shortName
      );
      this._syncSubdialNeedle();
    }
    for (const part of ["bezel", "dial", "inlay", "hands", "deck"]) {
      this.studio.setComponentSwatch(part, this.state.colors[part]);
    }
    this._syncSwellKeyColor(null, false);
    this._renderPresetChips();
    this._renderSwatchGrid();
    this._updateAllLabels();
  }

  randomizeColors() {
    // Pick a high-contrast designer combination from the expanded palette
    const bezelList = COMPONENT_SWATCHES.bezel;
    const dialList = COMPONENT_SWATCHES.dial;
    const handsList = COMPONENT_SWATCHES.hands;
    const deckList = COMPONENT_SWATCHES.deck;

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const bSw = pick(bezelList);
    const dSw = pick(dialList);
    const kSw = pick(deckList);

    // Automatically choose crisp high-contrast inlay typography & hands based on actual dial IDs
    const darkDials = ["obsidian", "navy", "slate", "cobalt", "terracotta"];
    const isDarkDial = darkDials.includes(dSw.id);
    const iId = isDarkDial ? "alabaster" : "charcoal";
    const validHands = handsList.filter((h) => h.id !== dSw.id && (isDarkDial ? h.id !== "charcoal" : h.id !== "alabaster"));
    const hSw = pick(validHands.length ? validHands : handsList);

    this.state.activeEditionId = "";
    this.state.colors = {
      bezel: bSw.id,
      dial: dSw.id,
      inlay: iId,
      hands: hSw.id,
      deck: kSw.id,
    };
    for (const part of ["bezel", "dial", "inlay", "hands", "deck"]) {
      this.studio.setComponentSwatch(part, this.state.colors[part]);
    }
    this._syncSwellKeyColor("bezel", false);
    if (this.studio.triggerWavePulse) {
      this.studio.triggerWavePulse(1.1);
    }
    this._renderPresetChips();
    this._renderSwatchGrid();
    this._updateAllLabels();
    this.showToast(`🎲 ${bSw.name} + ${dSw.name} + ${hSw.name}`);
  }

  // ============================================================================
  // GOOGLE MAPS-STYLE LIVE AUTOCOMPLETE DROPDOWN
  // ============================================================================
  async _updateAutocompleteSuggestions(query) {
    const q = (query || "").trim();
    this.dom.btnSearchClear.classList.toggle("hidden", q.length === 0);
    const acSeq = ++this._acSeq;

    const results = await searchLocationsAutocomplete(q);
    if (acSeq !== this._acSeq) return;
    this.state.autocompleteItems = results || [];
    this.state.autocompleteIndex = results.length > 0 ? 0 : -1;
    this._renderAutocompleteDropdown();
  }

  _renderAutocompleteDropdown() {
    const items = this.state.autocompleteItems;
    if (!items || items.length === 0) {
      this.dom.autocompleteDropdown.classList.add("hidden");
      this.dom.autocompleteDropdown.innerHTML = "";
      return;
    }

    this.dom.autocompleteDropdown.innerHTML = "";
    items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = `ac-item ${idx === this.state.autocompleteIndex ? "ac-active" : ""}`;
      row.setAttribute("role", "option");

      row.innerHTML = `
        <svg class="ac-pin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <div class="ac-text">
          <div class="ac-main">${this._escapeHtml(item.label)}</div>
          <div class="ac-sub">${this._escapeHtml(item.sublabel || "")}</div>
        </div>
      `;

      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this._selectAutocompleteItem(item);
      });

      this.dom.autocompleteDropdown.appendChild(row);
    });

    this.dom.autocompleteDropdown.classList.remove("hidden");
  }

  async _selectAutocompleteItem(item) {
    if (!item) return;
    clearTimeout(this.searchDebounce);
    this._acSeq++;
    this.dom.searchInput.value = item.label;
    this.dom.btnSearchClear.classList.remove("hidden");
    this.dom.autocompleteDropdown.classList.add("hidden");

    if (item.regionId) {
      const reg = ALL_KNOWN_REGIONS.find((r) => r.id === item.regionId);
      if (reg) {
        this.selectRegionPreset(reg);
        return;
      }
    }

    const seq = ++this._regionSeq;
    clearTimeout(this.loadingTimeout);
    this.dom.beachesStatusBadge.textContent = `Finding 5 nearest beaches...`;
    this.showLoadingOverlay(
      "Loading 5 Best Beaches...",
      `Searching surf breaks & live swell near ${item.label}`
    );

    const minOverlayDelay = new Promise((r) => setTimeout(r, 480));
    try {
      const [resolved] = await Promise.all([
        resolve5BestLocalBeaches(item.lat, item.lng, item.label),
        minOverlayDelay,
      ]);

      if (seq !== this._regionSeq) return;
      if (resolved && resolved.beaches?.length === 5) {
        this.state.activeRegion = resolved.region;
        this.state.beaches = resolved.beaches;
        this.state.selectedBeachIndex = 0;
        this._recomputeActiveBeachConditions();
        this._renderRegionPills();
        this._renderBeachesList();
        this.studio.updateDialTypography(
          this.state.beaches.map((b) => b.name),
          this.state.subdialMode,
          resolved.region.shortName
        );
        this.studio.pointToBeachSlot(0);
        this._syncSubdialNeedle();
        if (this.studio.triggerWavePulse) {
          this.studio.triggerWavePulse(1.25);
        }
        this._syncTelemetryToStudio();
        this._updateAllLabels();
        this.dom.beachesStatusBadge.textContent = `5 nearest breaks to ${resolved.region.shortName}`;
        this.showToast(`📍 Loaded 5 breaks for ${resolved.region.shortName}`);

        fetchLiveMarineTelemetry(item.lat, item.lng).then((live) => {
          if (live && seq === this._regionSeq) {
            this.state.activeRegion.swellHeightM = live.swellHeightM;
            this.state.activeRegion.swellPeriodS = live.swellPeriodS;
            this.state.activeRegion.swellDir = live.swellDir;
            this.state.activeRegion.worthItScore = live.worthItScore;
            this._recomputeActiveBeachConditions();
            this._syncSubdialNeedle();
            this._syncTelemetryToStudio();
            this._updateAllLabels();
          }
        });
      }
    } finally {
      if (seq === this._regionSeq) {
        this.hideLoadingOverlay();
      }
    }
  }

  _updateAllLabels() {
    const reg = this.state.activeRegion;
    const activeBeach = this.state.beaches[this.state.selectedBeachIndex]?.name || "DEE WHY";
    const swellM = this.state.activeSwellHeightM ?? 1.9;
    const swellFt = (swellM * 3.28084).toFixed(1);
    const periodS = this.state.activeSwellPeriodS ?? 13;
    const dir = this.state.activeSwellDir || "SSE";

    this.dom.hudRegionTitle.textContent = (reg.name || reg.shortName || "SYDNEY").toUpperCase();
    this.dom.hudSwellSummary.textContent = `BEST NOW: ${activeBeach} · ${swellM.toFixed(1)}m @ ${periodS}s ${dir}`;

    if (this.dom.hudSwellSize) {
      this.dom.hudSwellSize.textContent = `${swellM.toFixed(1)}m`;
    }
    if (this.dom.hudSwellFeet) {
      this.dom.hudSwellFeet.textContent = `(${swellFt}ft)`;
    }
    if (this.dom.hudSwellPeriod) {
      this.dom.hudSwellPeriod.textContent = `${periodS}s · ${dir}`;
    }
    if (this.dom.datumSwellVal) {
      this.dom.datumSwellVal.textContent = `${swellM.toFixed(1)}m (${swellFt}ft)`;
    }
    if (this.dom.datumSwellSub) {
      this.dom.datumSwellSub.textContent = `CAD FLOOR SWELL · ${periodS}s ${dir}`;
    }
    if (this.dom.datumCaliperLine) {
      const caliperPx = Math.round(Math.max(12, Math.min(44, 10 + swellM * 10.5)));
      this.dom.datumCaliperLine.style.height = `${caliperPx}px`;
    }
    if (this.dom.mobileDrawerSummary) {
      const ed = CURATED_EDITIONS.find((e) => e.id === this.state.activeEditionId);
      const colorName = ed ? ed.name : (this._getSwatchObj("bezel", this.state.colors.bezel)?.name || "Custom");
      this.dom.mobileDrawerSummary.textContent = `${colorName} · ${activeBeach} · STL`;
    }

    const part = this.state.activePart;
    const sw = this._getSwatchObj(part, this.state.colors[part]);
    this.dom.activeSwatchLabel.textContent = `${PART_LABELS[part]} — ${sw ? sw.name : ""}`;

    // Update Section 3 Live Break Telemetry Readout Card (replaces manual slider)
    const v = Number(this.state.conditionsRating);
    if (this.dom.ltBeachName) {
      this.dom.ltBeachName.textContent = activeBeach;
    }
    if (this.dom.ltSwellSize) {
      this.dom.ltSwellSize.textContent = `${swellM.toFixed(1)}m (${swellFt}ft)`;
    }
    if (this.dom.ltSwellPeriod) {
      this.dom.ltSwellPeriod.textContent = `${periodS}s ${dir}`;
    }
    const verdict = v >= 6.5 ? "YEAH" : v >= 4.5 ? "MAYBE" : "NAH";
    if (this.dom.sliderCondVal) {
      if (this.state.subdialMode === "conditions") {
        this.dom.sliderCondVal.textContent = `LIVE: ${v.toFixed(1)} / 10`;
      } else if (this.state.subdialMode === "swell") {
        this.dom.sliderCondVal.textContent = `LIVE: ${swellM.toFixed(1)}m (${swellFt}ft)`;
      } else {
        this.dom.sliderCondVal.textContent = `LIVE: ${verdict} (${v.toFixed(1)}/10)`;
      }
    }
    if (this.dom.ltVerdictText) {
      if (this.state.subdialMode === "conditions") {
        this.dom.ltVerdictText.textContent = `${v.toFixed(1)} / 10`;
      } else if (this.state.subdialMode === "swell") {
        const swellLabel = swellM >= 2.2 ? "EPIC" : swellM >= 1.2 ? "CLEAN" : "SMALL";
        this.dom.ltVerdictText.textContent = `${swellLabel} (${swellFt}ft)`;
      } else {
        this.dom.ltVerdictText.textContent = `${verdict} (${v.toFixed(1)})`;
      }
    }
  }

  // Mini 60fps Oscilloscope Wave Visualizer inside the Top-Left Status Pill
  _startHudWaveLoop() {
    const canvas = this.dom.hudWaveCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const draw = (now) => {
      requestAnimationFrame(draw);
      if (document.hidden || window.innerWidth <= 960) return;
      const t = now * 0.0045;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const hM = this.state.activeSwellHeightM ?? 1.9;
      const amp = Math.min(7.5, Math.max(2.5, hM * 2.6));
      const isNight = this.state.lightingMode === "nightlight";

      // Secondary depth wave in HUD oscilloscope
      ctx.beginPath();
      for (let x = 3; x <= w - 3; x++) {
        const env = Math.sin(((x - 3) / (w - 6)) * Math.PI);
        const y = h * 0.5 - Math.sin(x * 0.18 + t * 0.7) * (amp * 0.65) * env;
        if (x === 3) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isNight ? "rgba(56, 189, 248, 0.45)" : "rgba(255, 79, 0, 0.32)";
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.stroke();

      // Primary standing heave wave in HUD oscilloscope
      ctx.beginPath();
      for (let x = 3; x <= w - 3; x++) {
        const env = Math.sin(((x - 3) / (w - 6)) * Math.PI);
        const y = h * 0.5 - Math.sin(x * 0.22 - t * 0.4) * Math.cos(t * 1.1) * amp * env;
        if (x === 3) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.state.activeAccentHex || (isNight ? "#38BDF8" : "#FF4F00");
      ctx.lineWidth = 2.1;
      ctx.lineCap = "round";
      ctx.stroke();
    };
    requestAnimationFrame(draw);
  }

  _bindEvents() {
    // Google Maps-style live autocomplete input events
    this.dom.searchInput.addEventListener("focus", () => {
      this._updateAutocompleteSuggestions(this.dom.searchInput.value);
    });

    this.dom.searchInput.addEventListener("input", (e) => {
      const val = e.target.value;
      clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => {
        this._updateAutocompleteSuggestions(val);
      }, 110);
    });

    this.dom.searchInput.addEventListener("keydown", (e) => {
      const items = this.state.autocompleteItems || [];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (items.length > 0) {
          this.state.autocompleteIndex = (this.state.autocompleteIndex + 1) % items.length;
          this._renderAutocompleteDropdown();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (items.length > 0) {
          this.state.autocompleteIndex = (this.state.autocompleteIndex - 1 + items.length) % items.length;
          this._renderAutocompleteDropdown();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items.length > 0 && this.state.autocompleteIndex >= 0) {
          this._selectAutocompleteItem(items[this.state.autocompleteIndex]);
        } else if (this.dom.searchInput.value.trim()) {
          this._updateAutocompleteSuggestions(this.dom.searchInput.value).then(() => {
            if (this.state.autocompleteItems.length > 0) {
              this._selectAutocompleteItem(this.state.autocompleteItems[0]);
            }
          });
        }
      } else if (e.key === "Escape") {
        clearTimeout(this.searchDebounce);
        this._acSeq++;
        this.dom.autocompleteDropdown.classList.add("hidden");
      }
    });

    this.dom.btnSearchClear.addEventListener("click", () => {
      this.dom.searchInput.value = "";
      this.dom.btnSearchClear.classList.add("hidden");
      this.dom.searchInput.focus();
      this._updateAutocompleteSuggestions("");
    });

    document.addEventListener("click", (e) => {
      if (this.dom.searchContainer && !this.dom.searchContainer.contains(e.target)) {
        clearTimeout(this.searchDebounce);
        this._acSeq++;
        this.dom.autocompleteDropdown.classList.add("hidden");
      }
    });

    this.dom.partTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.selectPart(tab.dataset.part);
      });
    });

    if (this.dom.btnSurpriseColor) {
      this.dom.btnSurpriseColor.addEventListener("click", () => {
        this.randomizeColors();
      });
    }

    if (this.dom.brandEasterEgg) {
      this.dom.brandEasterEgg.addEventListener("click", () => {
        if (this.studio && this.studio.triggerPartyWaveSalute) {
          this.studio.triggerPartyWaveSalute();
        }
        this.showToast("🌊 Shaka! Party Wave Salute Activated");
      });
    }

    const triggerSetPulse = () => {
      if (this.studio && this.studio.triggerWavePulse) {
        this.studio.triggerWavePulse(1.55);
      }
      this.showToast(`🌊 Set Wave Rolling Through (${this.state.activeSwellHeightM.toFixed(1)}m @ ${this.state.activeSwellPeriodS}s)`);
    };
    if (this.dom.hudSwellHeroCard) {
      this.dom.hudSwellHeroCard.style.cursor = "pointer";
      this.dom.hudSwellHeroCard.title = "Click to trigger a rogue wave set pulse";
      this.dom.hudSwellHeroCard.addEventListener("click", triggerSetPulse);
    }
    if (this.dom.hudWaveCanvas) {
      this.dom.hudWaveCanvas.addEventListener("click", triggerSetPulse);
    }

    if (this.dom.studioCanvas) {
      this.dom.studioCanvas.addEventListener("dblclick", () => {
        const nextExplode = this.state.explodeFactor > 0.35 ? 0.0 : 0.92;
        this.state.explodeFactor = nextExplode;
        if (this.dom.sliderExplode) {
          this.dom.sliderExplode.value = String(nextExplode);
        }
        const targetCam = nextExplode > 0.35 ? "exploded" : "front";
        this.state.cameraView = targetCam;
        this.dom.camBtns.forEach((b) => b.classList.toggle("active", b.dataset.cam === targetCam));
        this.studio.setCameraPreset(targetCam);
        this.studio.setExplodeFactor(nextExplode);
        this.showToast(nextExplode > 0.35 ? "🔧 Exploded Internal Architecture" : "🔩 Assembled Monolith");
      });
    }

    this.dom.subdialBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.submode;
        this.state.subdialMode = mode;
        this.dom.subdialBtns.forEach((b) => b.classList.toggle("active", b === btn));
        this.studio.updateDialTypography(
          this.state.beaches.map((b) => b.name),
          mode,
          this.state.activeRegion.shortName
        );
        this._syncSubdialNeedle();
        this._updateAllLabels();
      });
    });

    this.dom.lightBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.light;
        this.setLightingMode(mode);
      });
    });

    this.dom.camBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.cam;
        this.state.cameraView = view;
        this.dom.camBtns.forEach((b) => b.classList.toggle("active", b === btn));
        if (this.dom.swellScaleDatum) {
          this.dom.swellScaleDatum.classList.toggle("macro-hidden", view === "macro" || view === "subdial" || view === "rear");
        }
        this.studio.setCameraPreset(view);
      });
    });

    if (this.dom.btnMobileDrawerToggle) {
      this.dom.btnMobileDrawerToggle.addEventListener("click", () => {
        this.toggleMobileDrawer();
      });
    }
    if (this.dom.btnMobileDrawerClose) {
      this.dom.btnMobileDrawerClose.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeMobileDrawer();
      });
    }
    if (this.dom.mdTabs) {
      this.dom.mdTabs.forEach((tab) => {
        tab.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openMobileDrawer(tab.dataset.mdtab);
        });
      });
    }
    if (this.dom.btnMobileSearchTrigger) {
      this.dom.btnMobileSearchTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openMobileDrawer("beaches");
        setTimeout(() => this.dom.searchInput && this.dom.searchInput.focus(), 180);
      });
    }
    if (this.dom.stageStatusPill) {
      this.dom.stageStatusPill.addEventListener("click", (e) => {
        if (window.innerWidth <= 960 && !e.target.closest("#btn-live-demo")) {
          this.openMobileDrawer("beaches");
          setTimeout(() => this.dom.searchInput && this.dom.searchInput.focus(), 180);
        }
      });
    }

    // Interactive Explode Slider
    if (this.dom.sliderExplode) {
      this.dom.sliderExplode.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        this.state.explodeFactor = val;
        if (val > 0.15 && this.state.cameraView !== "exploded") {
          this.state.cameraView = "exploded";
          this.dom.camBtns.forEach((b) => b.classList.toggle("active", b.dataset.cam === "exploded"));
          if (this.dom.swellScaleDatum) this.dom.swellScaleDatum.classList.add("macro-hidden");
          this.studio.setCameraPreset("exploded");
        } else if (val <= 0.04 && this.state.cameraView === "exploded") {
          this.state.cameraView = "front";
          this.dom.camBtns.forEach((b) => b.classList.toggle("active", b.dataset.cam === "front"));
          if (this.dom.swellScaleDatum) this.dom.swellScaleDatum.classList.remove("macro-hidden");
          this.studio.setCameraPreset("front");
        }
        this.studio.setExplodeFactor(val);
      });
    }

    this.dom.btnLiveDemo.addEventListener("click", () => {
      this.toggleLiveDemo();
    });

    const openModal = () => this.openOrderModal();
    this.dom.btnOrder.addEventListener("click", openModal);
    this.dom.btnTopDownload.addEventListener("click", openModal);

    this.dom.btnQuickExportStl.addEventListener("click", () => {
      this.studio.exportCustomDialSTL(this.state.activeRegion.code || "CUSTOM", true);
      this.showToast("⬇ Downloading Custom 3D Dial STL...");
    });
    this.dom.btnQuickExportFw.addEventListener("click", () => {
      this.downloadSpotsJson();
      this.showToast("⬇ Downloading spots.json Firmware Config...");
    });

    this.dom.btnModalClose.addEventListener("click", () => {
      this.dom.modalBackdrop.classList.add("hidden");
    });
    this.dom.modalBackdrop.addEventListener("click", (e) => {
      if (e.target === this.dom.modalBackdrop) {
        this.dom.modalBackdrop.classList.add("hidden");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.dom.modalBackdrop && !this.dom.modalBackdrop.classList.contains("hidden")) {
        this.dom.modalBackdrop.classList.add("hidden");
      }
    });

    this.dom.btnExportCustomDialStl.addEventListener("click", () => {
      this.studio.exportCustomDialSTL(this.state.activeRegion.code || "CUSTOM", true);
    });
    this.dom.btnDownloadFirmware.addEventListener("click", () => this.downloadSpotsJson());
    this.dom.btnDownloadWorkerJs.addEventListener("click", () => this.downloadCustomWorkerJs());
    this.dom.btnDownloadGuide.addEventListener("click", () => this.downloadBuildGuideMarkdown());
  }

  toggleLiveDemo() {
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
    this.state.liveDemoRunning = !this.state.liveDemoRunning;
    this.dom.btnLiveDemo.classList.toggle("active", this.state.liveDemoRunning);

    if (this.state.liveDemoRunning) {
      this.showToast("🌊 Live Swell Cycle Started");
      this.selectBeachIndex((this.state.selectedBeachIndex + 1) % 5);
      this.demoTimer = setInterval(() => {
        this.selectBeachIndex((this.state.selectedBeachIndex + 1) % 5);
      }, 2200);
    } else {
      this.showToast("⏸ Swell Cycle Paused");
    }
  }

  openOrderModal() {
    const fSw = this._getSwatchObj("bezel", this.state.colors.bezel);
    const dSw = this._getSwatchObj("dial", this.state.colors.dial);
    const hSw = this._getSwatchObj("hands", this.state.colors.hands);

    this.dom.modalSummaryCard.innerHTML = `
      <div class="sum-row"><span class="sum-label">Coastline</span><span class="sum-val">${this._escapeHtml(this.state.activeRegion.name)}</span></div>
      <div class="sum-row"><span class="sum-label">5 Custom Beaches</span><span class="sum-val">${this.state.beaches.map((b) => this._escapeHtml(b.name)).join(" · ")}</span></div>
      <div class="sum-row"><span class="sum-label">Live Swell Size</span><span class="sum-val">${this.state.activeSwellHeightM.toFixed(1)}m (${(this.state.activeSwellHeightM * 3.28084).toFixed(1)}ft) @ ${this.state.activeSwellPeriodS}s ${this._escapeHtml(this.state.activeSwellDir)}</span></div>
      <div class="sum-row"><span class="sum-label">Outer Frame</span><span class="sum-val">${this._escapeHtml(fSw ? fSw.name : "")}</span></div>
      <div class="sum-row"><span class="sum-label">Dial Faceplate</span><span class="sum-val">${this._escapeHtml(dSw ? dSw.name : "")}</span></div>
      <div class="sum-row"><span class="sum-label">Hands Accent</span><span class="sum-val">${this._escapeHtml(hSw ? hSw.name : "")}</span></div>
    `;
    this.dom.modalBackdrop.classList.remove("hidden");
  }

  downloadSpotsJson() {
    const spotsObj = {};
    this.state.beaches.forEach((b, i) => {
      const key = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `spot-${i + 1}`;
      spotsObj[key] = {
        name: b.name,
        lat: b.lat || -33.74,
        lon: b.lng || 151.31,
        idealWindDir: 270,
        idealSwellDir: 135,
        clockHour: [12, 10, 2, 8, 4][i] || 12,
      };
    });
    const blob = new Blob([JSON.stringify(spotsObj, null, 2)], { type: "application/json" });
    this._triggerDownload(blob, "spots.json");
  }

  downloadCustomWorkerJs() {
    const spotsObj = {};
    this.state.beaches.forEach((b, i) => {
      const key = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `spot-${i + 1}`;
      spotsObj[key] = {
        name: b.name,
        lat: b.lat || -33.74,
        lon: b.lng || 151.31,
        idealWindDir: 270,
        idealSwellDir: 135,
      };
    });
    const js = `// Custom Cloudflare Worker for ${this.state.activeRegion.name}
// Full repo: https://github.com/raphdixon/surfclock
const SPOTS = ${JSON.stringify(spotsObj, null, 2)};

export default {
  async fetch(request) {
    return new Response(JSON.stringify({ spots: SPOTS }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
`;
    const blob = new Blob([js], { type: "application/javascript" });
    this._triggerDownload(blob, "worker.js");
  }

  downloadBuildGuideMarkdown() {
    const fSw = this._getSwatchObj("bezel", this.state.colors.bezel);
    const dSw = this._getSwatchObj("dial", this.state.colors.dial);
    const tSw = this._getSwatchObj("inlay", this.state.colors.inlay);
    const hSw = this._getSwatchObj("hands", this.state.colors.hands);

    const md = `# SURF CLOCK — Custom Build Guide
- **Coastline:** ${this.state.activeRegion.name}
- **5 Beaches:** ${this.state.beaches.map((b, i) => `${i + 1}. ${b.name}`).join(" | ")}
- **Frame Color:** ${fSw?.name} (${fSw?.hex})
- **Dial Color:** ${dSw?.name} (${dSw?.hex})
- **Typography Color:** ${tSw?.name} (${tSw?.hex})
- **Hands Color:** ${hSw?.name} (${hSw?.hex})

## 1. 3D Printing
- Print \`01_outer_bezel_chassis.stl\` and \`05_rear_cover_usb.stl\` in **${fSw?.name}**.
- Print \`02a_dial_faceplate_with_text.stl\` in **${dSw?.name}** with a filament color change at \`Z = 2.60mm\` to **${tSw?.name}**.
- Print \`03_beach_hand_28byj48_capped.stl\` and \`04_conditions_hand_28byj48_capped.stl\` in **${hSw?.name}**.

## 2. Electronics & Wiring (https://github.com/raphdixon/surfclock)
- **Upper Stepper (Beach Hand):** ULN2003 IN1–IN4 → ESP32-S3 GPIO 4, 5, 6, 7
- **Lower Stepper (Sub-Dial):** ULN2003 IN1–IN4 → ESP32-S3 GPIO 11, 12, 13, 14
- **Power:** 5V & GND from ESP32-S3 USB-C rail
`;
    const blob = new Blob([md], { type: "text/markdown" });
    this._triggerDownload(blob, "SURF_CLOCK_BUILD_GUIDE.md");
  }

  _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 250);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.surfClockApp = new SurfClockConfiguratorApp();
});
