/*
 * Tridactyl theme colours using Adaptive Tab Bar Colour's selection model.
 *
 * The page colour is taken from the visible element stack at the horizontal
 * centre of the viewport, three pixels from the top. Only broad elements are
 * considered. Their backgrounds and opacity are composited from front to back,
 * then corrected for readable black or white UI text.
 *
 * This intentionally ignores <meta name="theme-color"> by default, matching
 * Adaptive Tab Bar Colour's current default behaviour.
 */

(() => {
  "use strict";

  const GLOBAL_KEY = "__tridactylAdaptivePageThemeV2";

  /* Remove the previous sampler when this version is sourced on an open page. */
  for (const key of ["__tridactylAdaptivePageThemeV1", GLOBAL_KEY]) {
    const instance = window[key];
    if (key === GLOBAL_KEY && instance?.version === 2) {
      instance.refresh();
      return;
    }
    if (instance && typeof instance.destroy === "function") instance.destroy();
    delete window[key];
  }

  const BLACK = { r: 0, g: 0, b: 0, a: 1 };
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };

  const clamp = (value, minimum = 0, maximum = 255) =>
    Math.min(maximum, Math.max(minimum, value));

  const normalise = (colour) => ({
    r: clamp(colour.r),
    g: clamp(colour.g),
    b: clamp(colour.b),
    a: clamp(colour.a ?? 1, 0, 1),
  });

  const rgb = (colour) => {
    const value = normalise(colour);
    return `rgb(${Math.round(value.r)} ${Math.round(value.g)} ${Math.round(value.b)})`;
  };

  const rgba = (colour) => {
    const value = normalise(colour);
    return `rgb(${Math.round(value.r)} ${Math.round(value.g)} ${Math.round(value.b)} / ${value.a.toFixed(3)})`;
  };

  const blend = (first, second, amount) => ({
    r: first.r + (second.r - first.r) * amount,
    g: first.g + (second.g - first.g) * amount,
    b: first.b + (second.b - first.b) * amount,
    a: (first.a ?? 1) + ((second.a ?? 1) - (first.a ?? 1)) * amount,
  });

  /* Composite foreground over background while preserving transparency. */
  const composite = (foreground, background) => {
    const front = normalise(foreground);
    const back = normalise(background);
    const alpha = front.a + back.a * (1 - front.a);
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (front.a * front.r + back.a * (1 - front.a) * back.r) / alpha,
      g: (front.a * front.g + back.a * (1 - front.a) * back.g) / alpha,
      b: (front.a * front.b + back.a * (1 - front.a) * back.b) / alpha,
      a: alpha,
    };
  };

  /* Adaptive Tab Bar Colour's brightness operation. */
  const brightness = (colour, percentage) => {
    const source = normalise(colour);
    const amount = percentage / 100;
    if (amount > 1) return { ...WHITE, a: source.a };
    if (amount > 0) return { ...blend(source, WHITE, amount), a: source.a };
    if (amount >= -1) {
      return {
        r: source.r * (amount + 1),
        g: source.g * (amount + 1),
        b: source.b * (amount + 1),
        a: source.a,
      };
    }
    return { ...BLACK, a: source.a };
  };

  /* Piecewise luminance approximation used by Adaptive Tab Bar Colour. */
  const channelLuminance = (value) => {
    if (value < 0) return 0;
    if (value < 32) return 0.1151 * value;
    if (value < 64) return 0.2935 * value - 5.7074;
    if (value < 96) return 0.5236 * value - 20.4339;
    if (value < 128) return 0.788 * value - 45.8232;
    if (value < 160) return 1.0811 * value - 83.3411;
    if (value < 192) return 1.3992 * value - 134.2269;
    if (value < 224) return 1.7395 * value - 199.5679;
    if (value < 256) return 2.1001 * value - 280.341;
    return 255;
  };

  const luminanceX255 = (colour) =>
    0.2126 * channelLuminance(colour.r) +
    0.7152 * channelLuminance(colour.g) +
    0.0722 * channelLuminance(colour.b);

  const contrastRatio = (first, second) => {
    const firstLuminance = luminanceX255(first);
    const secondLuminance = luminanceX255(second);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 12.75) / (darker + 12.75);
  };

  const preferredScheme = () =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const fallbackColour = () =>
    preferredScheme() === "dark"
      ? { r: 43, g: 42, b: 51, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };

  /* Match ATBC defaults: 9:1 for black text and 4.5:1 for white text. */
  const correctContrast = (colour) => {
    const source = normalise({ ...colour, a: 1 });
    const preferred = preferredScheme();
    const contrastWithBlack = contrastRatio(source, BLACK);
    const contrastWithWhite = contrastRatio(source, WHITE);
    const worksAsLight = contrastWithBlack > 9;
    const worksAsDark = contrastWithWhite > 4.5;

    /* ATBC allows switching between light and dark schemes by default. */
    if (worksAsLight) return { colour: source, scheme: "light", corrected: false };
    if (worksAsDark) return { colour: source, scheme: "dark", corrected: false };

    if (preferred === "light") {
      const luminance = luminanceX255(source);
      const adjustment =
        (100 * ((9 / contrastWithBlack - 1) * (luminance + 12.75))) /
        (255 - luminance);
      return {
        colour: brightness(source, adjustment),
        scheme: "light",
        corrected: true,
      };
    }

    const adjustment = (100 * contrastWithWhite) / 4.5 - 100;
    return {
      colour: brightness(source, adjustment),
      scheme: "dark",
      corrected: true,
    };
  };

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  const parseColour = (value) => {
    if (!context || !value || !CSS.supports("color", value)) return null;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: alpha / 255 };
  };

  const colourLayer = (element) => {
    if (!(element instanceof HTMLElement)) return null;
    const style = getComputedStyle(element);
    const opacity = Number.parseFloat(style.opacity);
    const colour = parseColour(style.backgroundColor);
    if (!colour || colour.a === 0 || !Number.isFinite(opacity) || opacity === 0) {
      return null;
    }
    return { ...colour, a: colour.a * clamp(opacity, 0, 1) };
  };

  /*
   * ATBC samples the element stack at the top-centre of the viewport and only
   * keeps elements that are at least 90% of the viewport width and 20px high.
   */
  const choosePageColour = () => {
    const width = Math.max(1, window.innerWidth);
    const elements =
      typeof document.elementsFromPoint === "function"
        ? document
            .elementsFromPoint(width / 2, 3)
            .filter(
              (element) =>
                element instanceof HTMLElement &&
                element.offsetWidth >= width * 0.9 &&
                element.offsetHeight >= 20,
            )
        : [];

    elements.push(document.body, document.documentElement);

    let result = { r: 0, g: 0, b: 0, a: 0 };
    for (const element of elements) {
      const layer = colourLayer(element);
      if (!layer) continue;
      result = composite(result, layer);
      if (result.a >= 0.999999) return normalise({ ...result, a: 1 });
    }
    return composite(result, fallbackColour());
  };

  const makePalette = () => {
    const sampled = choosePageColour();
    const corrected = correctContrast(sampled);
    const surface = corrected.colour;
    const scheme = corrected.scheme;

    /* ATBC's default offsets: base 0, secondary surfaces 5, selected tab 15. */
    const direction = scheme === "light" ? -1.5 : 1;
    const shifted = (offset) => brightness(surface, direction * offset);
    const raised = shifted(5);
    const selected = shifted(15);
    const foreground = scheme === "light" ? BLACK : WHITE;
    const muted = blend(foreground, surface, 0.32);
    const border = { ...foreground, a: 0.11 };

    const hint =
      scheme === "light"
        ? { r: 255, g: 207, b: 74, a: 1 }
        : { r: 255, g: 208, b: 91, a: 1 };
    const search =
      scheme === "light"
        ? { r: 255, g: 225, b: 92, a: 1 }
        : { r: 255, g: 214, b: 82, a: 1 };

    return {
      "--tridactyl-adaptive-page": rgb(sampled),
      "--tridactyl-adaptive-surface": rgb(surface),
      "--tridactyl-adaptive-raised": rgb(raised),
      "--tridactyl-adaptive-selected": rgb(selected),
      "--tridactyl-adaptive-fg": rgb(foreground),
      "--tridactyl-adaptive-muted": rgb(muted),
      "--tridactyl-adaptive-accent": "AccentColor",
      "--tridactyl-adaptive-accent-fg": "AccentColorText",
      "--tridactyl-adaptive-border": rgba(border),
      "--tridactyl-adaptive-shadow":
        scheme === "dark" ? "rgb(0 0 0 / 58%)" : "rgb(0 0 0 / 24%)",
      "--tridactyl-adaptive-hint": rgb(hint),
      "--tridactyl-adaptive-hint-fg": rgb(BLACK),
      "--tridactyl-adaptive-hint-active": "AccentColor",
      "--tridactyl-adaptive-hint-active-fg": "AccentColorText",
      "--tridactyl-adaptive-search": rgb(search),
      "--tridactyl-adaptive-search-fg": rgb(BLACK),
      "--tridactyl-adaptive-color-scheme": scheme,
    };
  };

  const setVariables = (root, variables) => {
    if (!root || root.nodeType !== 1 || !root.style) return false;
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
    root.style.setProperty(
      "color-scheme",
      variables["--tridactyl-adaptive-color-scheme"],
    );
    root.dataset.tridactylAdaptiveTheme = "atbc-v2";
    return true;
  };

  const retryTimers = new Set();
  let lastVariables = null;
  let refreshTimer = 0;
  let lastRefreshAt = 0;

  const applyToCommandLine = (variables) => {
    try {
      const frame = document.getElementById("cmdline_iframe");
      return setVariables(frame?.contentWindow?.document?.documentElement, variables);
    } catch (_) {
      return false;
    }
  };

  const applyEverywhere = (variables) => {
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();

    setVariables(document.documentElement, variables);
    applyToCommandLine(variables);

    for (const delay of [30, 100, 300, 800]) {
      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        applyToCommandLine(variables);
      }, delay);
      retryTimers.add(timer);
    }
  };

  const refresh = () => {
    if (!document.documentElement) return;
    lastRefreshAt = Date.now();
    lastVariables = makePalette();
    applyEverywhere(lastVariables);
  };

  /* Match ATBC's 250ms update throttle. */
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    const remaining = Math.max(0, 250 + lastRefreshAt - Date.now());
    refreshTimer = setTimeout(refresh, remaining);
  };

  const scheduleFocusedRefresh = () => {
    if (document.hasFocus()) scheduleRefresh();
  };

  const observers = [];
  const observe = (target, options) => {
    if (!target) return;
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(target, options);
    observers.push(observer);
  };

  observe(document.head, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["content", "media"],
  });
  observe(document.documentElement, {
    childList: true,
    attributes: true,
    attributeFilter: ["class", "data-darkreader-mode"],
  });
  observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });

  const ordinaryEvents = ["click", "resize", "scroll", "visibilitychange"];
  const animatedEvents = [
    "transitionend",
    "transitioncancel",
    "animationend",
    "animationcancel",
  ];
  for (const event of ordinaryEvents) {
    document.addEventListener(event, scheduleRefresh, { passive: true });
  }
  for (const event of animatedEvents) {
    document.addEventListener(event, scheduleFocusedRefresh, { passive: true });
  }

  const schemeQuery = matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener?.("change", scheduleRefresh);

  const destroy = () => {
    for (const observer of observers) observer.disconnect();
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
    clearTimeout(refreshTimer);
    for (const event of ordinaryEvents) {
      document.removeEventListener(event, scheduleRefresh);
    }
    for (const event of animatedEvents) {
      document.removeEventListener(event, scheduleFocusedRefresh);
    }
    schemeQuery.removeEventListener?.("change", scheduleRefresh);
    delete window[GLOBAL_KEY];
  };

  window[GLOBAL_KEY] = {
    version: 2,
    refresh,
    destroy,
    get variables() {
      return lastVariables;
    },
  };

  refresh();
})();
