// omp-ui theme repository tool. Built from LankfordAI/omp-ui 0.38.1 (22291fbb). Do not edit.

// packages/core/src/theme-repository-cli.ts
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// packages/core/src/theme-repository-tool.ts
import { createHash } from "node:crypto";

// packages/core/src/guards.ts
function isObject(value) {
  return value !== null && typeof value === "object";
}

// packages/core/src/theme-backdrop.ts
var BACKDROP_IMAGE_BYTES_MAX = 4 * 1024 * 1024;
var BACKDROP_SCENE_BYTES_MAX = 4 * 1024 * 1024;
var BACKDROP_BLUR_MAX = 32;
var LEGACY_DIM_KEY = "dim";
function sniffBackdropMime(bytes) {
  const at = (i) => bytes[i] ?? -1;
  if (at(0) === 137 && at(1) === 80 && at(2) === 78 && at(3) === 71) return "image/png";
  if (at(0) === 255 && at(1) === 216 && at(2) === 255) return "image/jpeg";
  const riff = String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF";
  if (riff && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, "").trimStart();
  if (head.startsWith("<") && /<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}
var SCENE_ACTIVE = /<\s*(script|foreignObject|animate|animateTransform|animateMotion|set)\b/i;
var SCENE_EXTERNAL = [/\b(?:href|src)\s*=\s*["']\s*(?!#|data:)/i, /@import\b/i, /url\(\s*["']?\s*(?!#|data:)/i];
function checkBackdropBytes(bytes) {
  if (bytes.length === 0) return { ok: false, message: "the backdrop file is empty" };
  const mime = sniffBackdropMime(bytes);
  if (mime === null) return { ok: false, message: "backdrops must be PNG, JPEG, WebP or SVG" };
  if (mime !== "image/svg+xml") {
    if (bytes.length > BACKDROP_IMAGE_BYTES_MAX) return { ok: false, message: "image backdrops can be at most 4 MiB" };
    return { ok: true, kind: "image", mime };
  }
  if (bytes.length > BACKDROP_SCENE_BYTES_MAX) return { ok: false, message: "scene backdrops can be at most 4 MiB" };
  const text = new TextDecoder().decode(bytes);
  if (SCENE_ACTIVE.test(text)) {
    return { ok: false, message: "scenes cannot contain script, foreignObject or SMIL animation" };
  }
  if (SCENE_EXTERNAL.some((pattern) => pattern.test(text))) {
    return { ok: false, message: "scenes cannot load other files" };
  }
  return { ok: true, kind: "scene", mime };
}

// packages/core/src/theme-origin.ts
var THEME_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.json$/;
var THEME_PATH_MAX = 200;
function isRepositoryThemePath(value) {
  return typeof value === "string" && value.length <= THEME_PATH_MAX && THEME_PATH.test(value);
}

// packages/core/src/theme.ts
var THEME_SYNTAX_SEEDS = ["comment", "string", "constant", "function", "type", "property"];
var IMPORTED_THEME_ID_PREFIX = "vscode-";
var AUTHORED_THEME_ID_PREFIX = "custom-";
var STORED_ID = /^(?:vscode|custom)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
var OPAQUE_HEX = /^#[0-9a-f]{6}$/i;
function storedThemeKind(id) {
  if (id.startsWith(IMPORTED_THEME_ID_PREFIX)) return "imported";
  if (id.startsWith(AUTHORED_THEME_ID_PREFIX)) return "authored";
  return null;
}
function parseHex(hex) {
  if (!OPAQUE_HEX.test(hex)) throw new TypeError(`Expected #rrggbb, received ${hex}`);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ];
}
function mixHex(colour, ink, colourWeight = 0.7) {
  if (colourWeight < 0 || colourWeight > 1) {
    throw new RangeError(`Colour weight must be between 0 and 1, received ${colourWeight}`);
  }
  const source = parseHex(colour);
  const target = parseHex(ink);
  const channel = (index) => Math.round(source[index] * colourWeight + target[index] * (1 - colourWeight)).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
function deriveTerminal(source) {
  const token = source.tokens;
  const syntax = source.syntax;
  const overrides = source.overrides?.term;
  const red = overrides?.red ?? token["--color-rose"];
  const green = overrides?.green ?? token["--color-signal"];
  const yellow = overrides?.yellow ?? token["--color-copper"];
  const blue = overrides?.blue ?? syntax.function;
  const magenta = overrides?.magenta ?? token["--color-iris"];
  const cyan = overrides?.cyan ?? syntax.type;
  const ink = token["--color-ink"];
  return {
    background: token["--color-surface"],
    foreground: ink,
    cursor: token["--color-signal"],
    cursorAccent: token["--color-surface"],
    selectionBackground: `${token["--color-iris"]}59`,
    selectionInactiveBackground: `${token["--color-iris"]}2e`,
    black: source.dark ? token["--color-sunken"] : ink,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white: token["--color-ink-mid"],
    brightBlack: source.dark ? token["--color-ink-faint"] : token["--color-ink-dim"],
    brightRed: mixHex(red, ink),
    brightGreen: mixHex(green, ink),
    brightYellow: mixHex(yellow, ink),
    brightBlue: mixHex(blue, ink),
    brightMagenta: mixHex(magenta, ink),
    brightCyan: mixHex(cyan, ink),
    brightWhite: ink,
    ...overrides
  };
}
function deriveCode(source) {
  const token = source.tokens;
  const syntax = source.syntax;
  return {
    foreground: token["--color-ink"],
    comment: syntax.comment,
    string: syntax.string,
    constant: syntax.constant,
    keyword: token["--color-iris"],
    function: syntax.function,
    type: syntax.type,
    property: syntax.property,
    punctuation: token["--color-ink-mid"],
    inserted: token["--color-signal"],
    deleted: token["--color-rose"],
    ...source.overrides?.code
  };
}
function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function deriveTheme(source) {
  return {
    id: source.id,
    label: source.label,
    dark: source.dark,
    tokens: source.tokens,
    term: deriveTerminal(source),
    code: deriveCode(source),
    rev: fnv1a(JSON.stringify([source.tokens, source.syntax, source.overrides ?? null])),
    backdrop: source.backdrop ?? null,
    origin: source.origin ?? null
  };
}
function relativeLuminance(hex) {
  const h = hex.replace("#", "").slice(0, 6);
  const channel = (offset) => {
    const c = Number.parseInt(h.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
function contrastRatio(a, b) {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function liftToContrast(colour, bg, ink, min) {
  for (let w = 1; w >= 0; w -= 0.025) {
    const mixed = mixHex(colour, ink, Math.max(w, 0));
    if (contrastRatio(mixed, bg) >= min) return mixed;
  }
  return ink;
}
function separatePlane(colour, from, toward) {
  if (colour !== from) return colour;
  const opposite = toward === "#ffffff" ? "#000000" : "#ffffff";
  for (const target of [toward, opposite]) {
    const nudged = mixHex(colour, target, 0.94);
    if (nudged !== from) return nudged;
  }
  return mixHex(colour, opposite, 0.85);
}
var INK_TIERS = [
  ["--color-ink", 10],
  ["--color-ink-mid", 4.5],
  ["--color-ink-dim", 4.5],
  ["--color-ink-faint", 4.5]
];
var ACCENTS = ["signal", "copper", "rose", "iris"];
var ANSI_READABLE = [
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite"
];
function themeContrastFailures(theme) {
  const failures = [];
  const t = theme.tokens;
  const surface = t["--color-surface"];
  const check = (label, fg, bg, min) => {
    const ratio = contrastRatio(fg, bg);
    if (!(ratio >= min)) failures.push({ kind: "contrast", label, fg, bg, ratio, min });
  };
  for (const [token, min] of INK_TIERS) check(token, t[token], surface, min);
  check("ink-dim on raised", t["--color-ink-dim"], t["--color-raised"], 4.5);
  check("ink-faint on raised", t["--color-ink-faint"], t["--color-raised"], 4.5);
  if (!theme.dark) {
    for (const accent of ACCENTS) {
      check(`${accent}-wash off raised`, t[`--color-${accent}-wash`], t["--color-raised"], 1.2);
    }
  }
  for (const accent of ACCENTS) {
    const colour = t[`--color-${accent}`];
    check(`${accent} on surface`, colour, surface, 3);
    check(`${accent} on wash`, colour, t[`--color-${accent}-wash`], 3);
  }
  for (const end of ["--color-think-cool", "--color-think-warm"]) {
    check(`${end} on surface`, t[end], surface, 3);
    check(`${end} on overlay`, t[end], t["--color-overlay"], 3);
  }
  check("ink on canvas", t["--color-ink"], surface, 4.5);
  check("ink on chip", t["--color-ink"], t["--color-hover"], 4.5);
  check("plan link on canvas", mixHex(t["--color-iris"], t["--color-ink"], 0.7), surface, 4.5);
  for (const [role, colour] of Object.entries(theme.code)) check(`code.${role}`, colour, surface, 3);
  const background = theme.term.background;
  for (const slot of ANSI_READABLE) check(`term.${slot}`, theme.term[slot], background, 3);
  check("term.brightBlack", theme.term.brightBlack, background, 2);
  const planes = [
    ["void = surface", "--color-void", "--color-surface"],
    ["surface = raised", "--color-surface", "--color-raised"],
    ["overlay = surface", "--color-overlay", "--color-surface"],
    ["hover = raised", "--color-hover", "--color-raised"]
  ];
  for (const [label, a, b] of planes) {
    if (t[a].toLowerCase() === t[b].toLowerCase()) failures.push({ kind: "planes", label, colour: t[a] });
  }
  return failures;
}
function oklabHueChroma(hex) {
  const linear = parseHex(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = linear;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360;
  return { hue, chroma: Math.hypot(a, bb) };
}
function signalAccentFailure(colour) {
  const { hue, chroma } = oklabHueChroma(colour);
  if (hue >= 100 && hue <= 200 && chroma >= 0.03) return null;
  return { kind: "signal", colour, hue };
}
function themeGateFailures(source) {
  const failures = themeContrastFailures(deriveTheme(source));
  if (storedThemeKind(source.id) === "authored") {
    const signal = signalAccentFailure(source.tokens["--color-signal"]);
    if (signal !== null) failures.push(signal);
  }
  return failures;
}

// packages/core/src/vscode-theme.ts
var VSCODE_INCLUDE_DEPTH_MAX = 8;
function stripJsonc(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
var HEX_ANY = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
function normalizeVsCodeColour(value, backdrop) {
  if (value === void 0) return null;
  const v = value.trim();
  if (!HEX_ANY.test(v)) return null;
  const digits = v.length <= 5 ? [...v.slice(1)].map((d) => d + d).join("") : v.slice(1);
  const rgb = `#${digits.slice(0, 6).toLowerCase()}`;
  if (digits.length === 6) return rgb;
  const alpha = Number.parseInt(digits.slice(6, 8), 16) / 255;
  return mixHex(rgb, backdrop, alpha);
}
function scopeScore(ruleScope, wanted) {
  const leaf = ruleScope.split(/\s+/).pop() ?? "";
  if (leaf === wanted) return 1e3 + leaf.length;
  if (wanted.startsWith(`${leaf}.`)) return leaf.length;
  return -1;
}
function scopeColour(rules, scopes) {
  for (const wanted of scopes) {
    let best = null;
    for (const rule of rules) {
      for (const ruleScope of rule.scopes) {
        const score = scopeScore(ruleScope, wanted);
        if (score >= 0 && (best === null || score >= best.score)) best = { score, colour: rule.foreground };
      }
    }
    if (best) return best.colour;
  }
  return void 0;
}
var SEED_SCOPES = {
  comment: ["comment.line", "comment"],
  string: ["string.quoted.double", "string"],
  constant: ["constant.numeric", "constant.language", "constant"],
  function: ["entity.name.function", "support.function"],
  type: ["entity.name.type", "entity.name.class", "support.type", "storage.type"],
  property: ["variable.other.property", "support.type.property-name", "variable.other.object.property", "variable"]
};
var TERMINAL_DEFAULTS = {
  dark: {
    red: "#cd3131",
    green: "#0dbc79",
    yellow: "#e5e510",
    blue: "#2472c8",
    magenta: "#bc3fbc",
    cyan: "#11a8cd"
  },
  light: {
    red: "#cd3131",
    green: "#107c10",
    yellow: "#949800",
    blue: "#0451a5",
    magenta: "#bc05bc",
    cyan: "#0598bc"
  }
};
var EDITOR_DEFAULTS = {
  dark: { background: "#1e1e1e", foreground: "#d4d4d4" },
  light: { background: "#ffffff", foreground: "#000000" }
};
var ANSI_KEYS = {
  red: "terminal.ansiRed",
  green: "terminal.ansiGreen",
  yellow: "terminal.ansiYellow",
  blue: "terminal.ansiBlue",
  magenta: "terminal.ansiMagenta",
  cyan: "terminal.ansiCyan",
  brightRed: "terminal.ansiBrightRed",
  brightGreen: "terminal.ansiBrightGreen",
  brightYellow: "terminal.ansiBrightYellow",
  brightBlue: "terminal.ansiBrightBlue",
  brightMagenta: "terminal.ansiBrightMagenta",
  brightCyan: "terminal.ansiBrightCyan"
};
function importedThemeId(label) {
  const slug = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "");
  return `${IMPORTED_THEME_ID_PREFIX}${slug === "" ? "theme" : slug}`;
}
function mapVsCodeTheme(doc, label) {
  const editorBgRaw = doc.colors["editor.background"];
  const typeDark = doc.type === "dark" || doc.type === "hc";
  const typeLight = doc.type === "light" || doc.type === "hcLight";
  const provisional = normalizeVsCodeColour(editorBgRaw, "#000000");
  const dark = typeDark || !typeLight && (provisional === null || relativeLuminance(provisional) < 0.2);
  const scheme = dark ? "dark" : "light";
  const defaults = EDITOR_DEFAULTS[scheme];
  const surface = normalizeVsCodeColour(editorBgRaw, defaults.background) ?? defaults.background;
  const colour = (key, over = surface) => normalizeVsCodeColour(doc.colors[key], over);
  const first = (keys, over = surface) => {
    for (const key of keys) {
      const value = colour(key, over);
      if (value !== null) return value;
    }
    return null;
  };
  const deeper = "#000000";
  const lighter = "#ffffff";
  const toward = dark ? "#ffffff" : "#000000";
  const rawInk = first(["editor.foreground", "foreground"]) ?? defaults.foreground;
  const ink = liftToContrast(rawInk, surface, toward, 10);
  const step = (base, weight, target) => mixHex(base, target, 1 - weight);
  const sunken = separatePlane(
    first(["sideBar.background", "activityBar.background", "panel.background"]) ?? step(surface, 0.04, deeper),
    surface,
    deeper
  );
  const voidPlane = separatePlane(
    first(["titleBar.activeBackground", "activityBar.background", "editorGroupHeader.tabsBackground"]) ?? step(sunken, 0.04, deeper),
    surface,
    deeper
  );
  const raised = separatePlane(
    first(["editorWidget.background", "input.background", "dropdown.background"]) ?? step(surface, 0.04, lighter),
    surface,
    lighter
  );
  const overlay = separatePlane(
    first(["editorSuggestWidget.background", "quickInput.background", "menu.background"]) ?? step(raised, 0.05, lighter),
    surface,
    lighter
  );
  let hover = first(["list.hoverBackground", "list.inactiveSelectionBackground", "toolbar.hoverBackground"]) ?? step(overlay, 0.06, toward);
  for (let w = 0.9; contrastRatio(ink, hover) < 4.5 && w >= 0; w -= 0.1) hover = mixHex(hover, surface, w);
  hover = separatePlane(hover, raised, toward);
  const line = first(["panel.border", "sideBar.border", "editorGroup.border", "widget.border"]) ?? step(surface, 0.12, toward);
  const lineSoft = mixHex(line, surface, 0.55);
  const lineStrong = first(["focusBorder", "input.border", "contrastBorder"]) ?? step(line, 0.12, toward);
  const tier = (keys, weight, min) => {
    const base = first(keys) ?? mixHex(ink, surface, weight);
    const onSurface = liftToContrast(base, surface, ink, min);
    return liftToContrast(onSurface, raised, ink, min);
  };
  const inkMid = tier(["descriptionForeground", "sideBar.foreground"], 0.72, 4.5);
  const inkDim = tier(["tab.inactiveForeground", "editorLineNumber.foreground"], 0.55, 4.5);
  const inkFaint = tier(["disabledForeground", "editorLineNumber.foreground"], 0.42, 4.5);
  const ansi = TERMINAL_DEFAULTS[scheme];
  const termColour = (slot) => colour(ANSI_KEYS[slot], surface) ?? normalizeVsCodeColour(ansi[slot], surface) ?? ink;
  const accent = (raw) => {
    const lifted = liftToContrast(raw, surface, ink, 3);
    let wash = mixHex(lifted, surface, dark ? 0.16 : 0.14);
    if (!dark) {
      for (let w = 0.14; contrastRatio(wash, raised) < 1.2 && w <= 0.5; w += 0.02) wash = mixHex(lifted, surface, w);
    }
    const colourOnWash = liftToContrast(lifted, wash, ink, 3);
    return { colour: colourOnWash, dim: mixHex(colourOnWash, surface, 0.6), wash };
  };
  const signal = accent(first(["terminal.ansiGreen", "gitDecoration.untrackedResourceForeground"]) ?? termColour("green"));
  const copper = accent(first(["editorWarning.foreground", "terminal.ansiYellow"]) ?? termColour("yellow"));
  const rose = accent(first(["editorError.foreground", "errorForeground", "terminal.ansiRed"]) ?? termColour("red"));
  const iris = accent(first(["terminal.ansiMagenta"]) ?? termColour("magenta"));
  let irisColour = iris.colour;
  for (let w = 0.9; contrastRatio(mixHex(irisColour, ink, 0.7), surface) < 4.5 && w >= 0; w -= 0.1) {
    irisColour = mixHex(iris.colour, ink, w);
  }
  const thinkEnd = (raw) => liftToContrast(liftToContrast(raw, surface, ink, 3), overlay, ink, 3);
  const thinkCool = thinkEnd(termColour("cyan"));
  const thinkWarm = thinkEnd(termColour("magenta"));
  const tokens = {
    "--color-void": voidPlane,
    "--color-sunken": sunken,
    "--color-surface": surface,
    "--color-raised": raised,
    "--color-overlay": overlay,
    "--color-hover": hover,
    "--color-line": line,
    "--color-line-soft": lineSoft,
    "--color-line-strong": lineStrong,
    "--color-ink": ink,
    "--color-ink-mid": inkMid,
    "--color-ink-dim": inkDim,
    "--color-ink-faint": inkFaint,
    "--color-signal": signal.colour,
    "--color-signal-dim": signal.dim,
    "--color-signal-wash": signal.wash,
    "--color-copper": copper.colour,
    "--color-copper-dim": copper.dim,
    "--color-copper-wash": copper.wash,
    "--color-rose": rose.colour,
    "--color-rose-dim": rose.dim,
    "--color-rose-wash": rose.wash,
    "--color-iris": irisColour,
    "--color-iris-dim": iris.dim,
    "--color-iris-wash": iris.wash,
    "--color-think-cool": thinkCool,
    "--color-think-warm": thinkWarm,
    "--color-edge-hi": dark ? "rgb(255 255 255 / 0.05)" : "rgb(255 255 255 / 0.9)",
    "--color-edge-lo": dark ? "rgb(0 0 0 / 0.4)" : "rgb(15 23 32 / 0.10)"
  };
  const seedFallback = {
    comment: inkDim,
    string: termColour("green"),
    constant: termColour("magenta"),
    function: termColour("blue"),
    type: termColour("cyan"),
    property: inkMid
  };
  const syntax = {};
  for (const seed of Object.keys(SEED_SCOPES)) {
    const raw = normalizeVsCodeColour(scopeColour(doc.tokenColors, SEED_SCOPES[seed]), surface) ?? seedFallback[seed];
    syntax[seed] = liftToContrast(raw, surface, ink, 3);
  }
  const code = {};
  const keyword = normalizeVsCodeColour(scopeColour(doc.tokenColors, ["keyword.control", "keyword", "storage"]), surface);
  if (keyword !== null) {
    const lifted = liftToContrast(keyword, surface, ink, 3);
    if (lifted !== irisColour) code.keyword = lifted;
  }
  const term = {};
  const projected = deriveTheme({ id: "probe", label, dark, tokens, syntax }).term;
  for (const slot of Object.keys(ANSI_KEYS)) {
    const raw = colour(ANSI_KEYS[slot], surface);
    if (raw === null) continue;
    const lifted = liftToContrast(raw, surface, ink, 3);
    if (lifted !== projected[slot]) term[slot] = lifted;
  }
  const source = { id: importedThemeId(label), label, dark, tokens, syntax };
  if (Object.keys(term).length > 0 || Object.keys(code).length > 0) {
    source.overrides = {};
    if (Object.keys(term).length > 0) source.overrides.term = term;
    if (Object.keys(code).length > 0) source.overrides.code = code;
  }
  return source;
}
var VSCODE_THEME_FILE_BYTES_MAX = 2 * 1024 * 1024;
var VSCODE_THEME_FILES_MAX = VSCODE_INCLUDE_DEPTH_MAX + 1;

// packages/core/src/theme-seeds.ts
var THEME_SEED_ACCENTS = ["signal", "copper", "rose", "iris"];
var THEME_SEED_DEFAULTS = {
  dark: {
    ink: "#eaeef3",
    accents: { signal: "#4de0a1", copper: "#f2aa6a", rose: "#f57d94", iris: "#a595f9" },
    syntax: {
      comment: "#5f6b7c",
      string: "#e0b184",
      constant: "#e39db5",
      function: "#7fb8e8",
      type: "#6fc7d4",
      property: "#a8c5e8"
    },
    think: { cool: "#71c5ea", warm: "#f188c6" }
  },
  light: {
    ink: "#101419",
    accents: { signal: "#066544", copper: "#894706", rose: "#ab1936", iris: "#4732b6" },
    syntax: {
      comment: "#6a7885",
      string: "#984b1a",
      constant: "#a11a6b",
      function: "#1c5fb0",
      type: "#0a6168",
      property: "#2a5a8a"
    },
    think: { cool: "#055f7d", warm: "#a1156b" }
  }
};
var SEED_HEX = /^#[0-9a-f]{6}$/i;
var SEED_KEYS = ["canvas", "ink", "accents", "syntax"];
function seedColours(value, keys) {
  if (!isObject(value) || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([key, colour]) => keys.includes(key) && typeof colour === "string" && SEED_HEX.test(colour)
  );
}
function isThemeSeeds(value) {
  if (!isObject(value) || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => !SEED_KEYS.includes(key))) return false;
  const { canvas, ink, accents, syntax } = value;
  if (typeof canvas !== "string" || !SEED_HEX.test(canvas)) return false;
  if (ink !== void 0 && (typeof ink !== "string" || !SEED_HEX.test(ink))) return false;
  if (accents !== void 0 && !seedColours(accents, THEME_SEED_ACCENTS)) return false;
  return syntax === void 0 || seedColours(syntax, THEME_SYNTAX_SEEDS);
}
var SEED_SCOPE = {
  comment: "comment.line",
  string: "string.quoted.double",
  constant: "constant.numeric",
  function: "entity.name.function",
  type: "entity.name.type",
  property: "variable.other.property"
};
function themeColoursFromSeeds(seeds) {
  const canvas = seeds.canvas.toLowerCase();
  const dark = relativeLuminance(canvas) < 0.2;
  const defaults = THEME_SEED_DEFAULTS[dark ? "dark" : "light"];
  const ink = seeds.ink ?? defaults.ink;
  const accents = { ...defaults.accents, ...seeds.accents };
  const syntax = { ...defaults.syntax, ...seeds.syntax };
  const doc = {
    name: null,
    type: dark ? "dark" : "light",
    colors: {
      "editor.background": canvas,
      "editor.foreground": ink,
      "terminal.ansiGreen": accents.signal,
      "editorWarning.foreground": accents.copper,
      "editorError.foreground": accents.rose,
      "terminal.ansiMagenta": accents.iris
    },
    tokenColors: THEME_SYNTAX_SEEDS.map((seed) => ({ scopes: [SEED_SCOPE[seed]], foreground: syntax[seed] }))
  };
  const mapped = mapVsCodeTheme(doc, "seeded");
  const tokens = { ...mapped.tokens };
  const mappedInk = tokens["--color-ink"];
  const surface = tokens["--color-surface"];
  const planes = [surface, tokens["--color-raised"], tokens["--color-sunken"], tokens["--color-void"]];
  const [wMid, wDim, wFaint] = dark ? [0.82, 0.72, 0.65] : [0.9, 0.81, 0.72];
  const lift = (weight) => planes.reduce((colour, plane) => liftToContrast(colour, plane, mappedInk, 4.5), mixHex(mappedInk, surface, weight));
  const stronger = (a, b) => contrastRatio(a, surface) >= contrastRatio(b, surface) ? a : b;
  const faint = lift(wFaint);
  const dim = stronger(lift(wDim), faint);
  const mid = stronger(lift(wMid), dim);
  tokens["--color-ink-mid"] = mid;
  tokens["--color-ink-dim"] = dim;
  tokens["--color-ink-faint"] = faint;
  const overlay = tokens["--color-overlay"];
  const thinkEnd = (raw) => liftToContrast(liftToContrast(raw, surface, mappedInk, 3), overlay, mappedInk, 3);
  tokens["--color-think-cool"] = thinkEnd(defaults.think.cool);
  tokens["--color-think-warm"] = thinkEnd(defaults.think.warm);
  return { dark, tokens, syntax: mapped.syntax };
}

// packages/core/src/theme-file.ts
var THEME_FILE_FORMAT = "omp-ui-theme";
var THEME_FILE_VERSION = 1;
var THEME_FILE_BYTES_MAX = 6 * 1024 * 1024;
var LABEL_MAX = 80;
var BACKDROP_DATA_MAX = Math.ceil(BACKDROP_IMAGE_BYTES_MAX / 3) * 4;
var ASSET_HASH = /^[0-9a-f]{64}$/;
var hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
var inRange = (value, max) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
function isDraftBackdrop(value) {
  if (!isObject(value) || Array.isArray(value)) return false;
  if (!inRange(value.blur, BACKDROP_BLUR_MAX)) return false;
  if (value.from === "bytes") {
    return hasOnlyKeys(value, ["from", "data", "blur", LEGACY_DIM_KEY]) && typeof value.data === "string" && value.data.length <= BACKDROP_DATA_MAX;
  }
  if (value.from === "asset") {
    return hasOnlyKeys(value, ["from", "assetHash", "blur", LEGACY_DIM_KEY]) && typeof value.assetHash === "string" && ASSET_HASH.test(value.assetHash);
  }
  return false;
}
function isStoredThemeDraft(value) {
  if (!isObject(value) || Array.isArray(value)) return false;
  if (!hasOnlyKeys(value, ["id", "label", "seeds", "backdrop"])) return false;
  const { id, label, seeds, backdrop } = value;
  if (id !== void 0 && (typeof id !== "string" || !STORED_ID.test(id) || !id.startsWith(AUTHORED_THEME_ID_PREFIX))) {
    return false;
  }
  if (typeof label !== "string") return false;
  const trimmed = label.trim().length;
  if (trimmed < 1 || trimmed > LABEL_MAX) return false;
  if (!isThemeSeeds(seeds)) return false;
  return backdrop === null || isDraftBackdrop(backdrop);
}
function sourceFromDraft(id, label, seeds) {
  return { id, label, ...themeColoursFromSeeds(seeds) };
}
var MALFORMED = { ok: false, message: "the theme file is malformed" };
function parseThemeFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonc(text));
  } catch {
    return MALFORMED;
  }
  if (!isObject(parsed) || Array.isArray(parsed)) return MALFORMED;
  if (parsed.format !== THEME_FILE_FORMAT) return { ok: false, message: "this is not an omp-ui theme file" };
  if (typeof parsed.version === "number" && parsed.version > THEME_FILE_VERSION) {
    return { ok: false, message: "this theme file needs a newer omp-ui" };
  }
  if (parsed.version !== THEME_FILE_VERSION) return MALFORMED;
  if (!hasOnlyKeys(parsed, ["format", "version", "label", "seeds", "backdrop"])) return MALFORMED;
  let backdrop = null;
  if (parsed.backdrop !== void 0) {
    const file = parsed.backdrop;
    if (!isObject(file) || Array.isArray(file) || !hasOnlyKeys(file, ["mime", "data", "blur", LEGACY_DIM_KEY])) {
      return MALFORMED;
    }
    if (typeof file.mime !== "string" || typeof file.data !== "string") return MALFORMED;
    backdrop = { from: "bytes", data: file.data, blur: file.blur };
  }
  const draft = { label: parsed.label, seeds: parsed.seeds, backdrop };
  return isStoredThemeDraft(draft) ? { ok: true, draft } : MALFORMED;
}

// packages/core/src/theme-repository-format.ts
var THEME_INDEX_FILE = "omp-ui-themes.json";
var THEME_INDEX_FORMAT = "omp-ui-theme-index";
var THEME_INDEX_VERSION = 1;
var THEME_INDEX_BYTES_MAX = 64 * 1024;
var THEME_INDEX_ENTRIES_MAX = 48;
var THEME_INDEX_V2_FILE = "omp-ui-themes.v2.json";
var THEME_INDEX_V2_VERSION = 2;
var THEME_INDEX_V2_BYTES_MAX = 512 * 1024;
var THEME_INDEX_V2_ENTRIES_MAX = 500;
var THEME_TAGS_MAX = 6;
var THEME_TAG_CHARS_MAX = 24;
var THEME_DESCRIPTION_MAX = 160;
var THEME_SLUG_CHARS_MAX = 64;
var REPOSITORY_IMAGE_BYTES_MAX = 1024 * 1024;
var THEME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var THEME_DETAILS_FORMAT = "omp-ui-theme-details";
var THEME_DETAILS_VERSION = 1;
var GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
var DETAILS_KEYS = ["format", "version", "tags", "description"];
var LABEL_MAX2 = 80;
var INDEX_KEYS = ["format", "version", "themes"];
var ENTRY_KEYS = ["path", "label", "seeds", "backdrop"];
var hasExactKeys = (value, keys) => {
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((key) => present.includes(key));
};
var EMPTY_THEME_META = Object.freeze({
  tags: Object.freeze([]),
  author: null,
  description: null,
  added: null,
  featured: false
});
function isThemeTag(value) {
  return typeof value === "string" && value.length <= THEME_TAG_CHARS_MAX && THEME_SLUG.test(value);
}
function isThemeAuthor(value) {
  return typeof value === "string" && GITHUB_HANDLE.test(value);
}
function parseDescription(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= THEME_DESCRIPTION_MAX ? trimmed : null;
}
function parseThemeMeta(value) {
  const tags = [];
  if (Array.isArray(value.tags)) {
    for (const tag of value.tags) {
      if (!isThemeTag(tag) || tags.includes(tag)) continue;
      tags.push(tag);
      if (tags.length === THEME_TAGS_MAX) break;
    }
  }
  return {
    tags,
    author: isThemeAuthor(value.author) ? value.author : null,
    description: parseDescription(value.description),
    added: typeof value.added === "string" && ISO_DATE.test(value.added) ? value.added : null,
    featured: value.featured === true
  };
}
var MALFORMED2 = { ok: false, message: "the theme index is malformed" };
function parseIndexRoot(text, version) {
  let parsed;
  try {
    parsed = JSON.parse(stripJsonc(text));
  } catch {
    return MALFORMED2;
  }
  if (!isObject(parsed) || Array.isArray(parsed)) return MALFORMED2;
  if (parsed.format !== THEME_INDEX_FORMAT) return { ok: false, message: "this is not an omp-ui theme index" };
  if (typeof parsed.version === "number" && parsed.version > version) {
    return { ok: false, message: "this theme repository needs a newer omp-ui" };
  }
  if (parsed.version !== version) return MALFORMED2;
  return { ok: true, root: parsed };
}
function requiredEntryFields(entry, paths) {
  const { path: path2, label, seeds, backdrop } = entry;
  if (!isRepositoryThemePath(path2) || paths.has(path2)) return null;
  if (typeof label !== "string") return null;
  const trimmed = label.trim();
  if (trimmed.length < 1 || trimmed.length > LABEL_MAX2) return null;
  if (!isThemeSeeds(seeds)) return null;
  if (backdrop !== "image" && backdrop !== "scene" && backdrop !== null) return null;
  return { path: path2, label: trimmed, seeds, backdrop };
}
function parseEntries(themes, strict) {
  const entries = [];
  const paths = /* @__PURE__ */ new Set();
  for (const [i, entry] of themes.entries()) {
    const invalid = { ok: false, message: `theme index entry ${i + 1} is invalid` };
    if (!isObject(entry) || Array.isArray(entry)) return invalid;
    if (strict && !hasExactKeys(entry, ENTRY_KEYS)) return invalid;
    const fields = requiredEntryFields(entry, paths);
    if (fields === null) return invalid;
    paths.add(fields.path);
    entries.push({ ...fields, meta: strict ? EMPTY_THEME_META : parseThemeMeta(entry) });
  }
  return { ok: true, entries };
}
function parseThemeIndex(text) {
  const head = parseIndexRoot(text, THEME_INDEX_VERSION);
  if (!head.ok) return head;
  if (!hasExactKeys(head.root, INDEX_KEYS)) return MALFORMED2;
  const themes = head.root.themes;
  if (!Array.isArray(themes) || themes.length > THEME_INDEX_ENTRIES_MAX) return MALFORMED2;
  return parseEntries(themes, true);
}
function parseThemeIndexV2(text) {
  const head = parseIndexRoot(text, THEME_INDEX_V2_VERSION);
  if (!head.ok) return head;
  const themes = head.root.themes;
  if (!Array.isArray(themes) || themes.length > THEME_INDEX_V2_ENTRIES_MAX) return MALFORMED2;
  return parseEntries(themes, false);
}
var DETAILS_MALFORMED = { ok: false, message: "the theme details file is malformed" };
function parseThemeDetails(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DETAILS_MALFORMED;
  }
  if (!isObject(parsed) || Array.isArray(parsed)) return DETAILS_MALFORMED;
  if (parsed.format !== THEME_DETAILS_FORMAT) return { ok: false, message: "this is not an omp-ui theme details file" };
  if (typeof parsed.version === "number" && parsed.version > THEME_DETAILS_VERSION) {
    return { ok: false, message: "this theme details file needs a newer omp-ui" };
  }
  if (parsed.version !== THEME_DETAILS_VERSION) return DETAILS_MALFORMED;
  const hasAuthor = Object.hasOwn(parsed, "author");
  if (!hasExactKeys(parsed, hasAuthor ? [...DETAILS_KEYS, "author"] : DETAILS_KEYS)) return DETAILS_MALFORMED;
  const { tags, description, author } = parsed;
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > THEME_TAGS_MAX) return DETAILS_MALFORMED;
  if (!tags.every(isThemeTag) || new Set(tags).size !== tags.length) return DETAILS_MALFORMED;
  const trimmed = parseDescription(description);
  if (trimmed === null) return DETAILS_MALFORMED;
  if (hasAuthor && !isThemeAuthor(author)) return DETAILS_MALFORMED;
  return { ok: true, details: { tags: [...tags], description: trimmed, author: hasAuthor ? author : null } };
}
function canonicalSeeds(seeds) {
  const colours = (map) => {
    if (map === void 0) return null;
    const entries = Object.entries(map).filter((entry) => typeof entry[1] === "string").map(([key, colour]) => [key, colour.toLowerCase()]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return entries.length === 0 ? null : entries;
  };
  return JSON.stringify([
    seeds.canvas.toLowerCase(),
    seeds.ink?.toLowerCase() ?? null,
    colours(seeds.accents),
    colours(seeds.syntax)
  ]);
}
function sameThemeSeeds(a, b) {
  return canonicalSeeds(a) === canonicalSeeds(b);
}

// packages/core/src/theme-repository-tool.ts
var TAG_VOCABULARY_MAX = 40;
var FEATURED_MAX = 12;
var TOP_LEVEL = /* @__PURE__ */ new Set([
  "README.md",
  "LICENSE",
  "LICENSE-CODE",
  "CONTRIBUTING.md",
  "tags.json",
  "featured.json",
  "omp-ui-themes.json",
  "omp-ui-themes.v2.json",
  ".gitignore",
  ".gitattributes",
  "tools/omp-ui-theme-tool.mjs"
]);
var DETAILS_SUFFIX = ".details.json";
var STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
var TAGS_KEYS = ["format", "version", "tags"];
var TAG_KEYS = ["id", "description"];
var FEATURED_KEYS = ["format", "version", "paths"];
var decode = (bytes) => new TextDecoder().decode(bytes);
var exactKeys = (value, keys) => {
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((key) => present.includes(key));
};
function plainJson(bytes) {
  try {
    return JSON.parse(decode(bytes));
  } catch {
    return void 0;
  }
}
function formatGateFailure(failure) {
  switch (failure.kind) {
    case "contrast":
      return `${failure.label}: ${failure.ratio.toFixed(2)}:1 (needs ${failure.min}:1)`;
    case "planes":
      return `${failure.label}: the two planes are the same colour`;
    case "signal":
      return `agent activity colour ${failure.colour} is not a green (hue ${Math.round(failure.hue)}\xB0; it needs a hue from 100\xB0 to 200\xB0 and must not be grey)`;
  }
}
function readVocabulary(files, fail) {
  const bytes = files.get("tags.json");
  if (bytes === void 0) {
    fail("tags.json", "missing; it lists the tags themes may use");
    return /* @__PURE__ */ new Set();
  }
  const value = plainJson(bytes);
  if (!isObject(value) || Array.isArray(value) || !exactKeys(value, TAGS_KEYS)) {
    fail("tags.json", 'must be { "format": "omp-ui-theme-tags", "version": 1, "tags": [...] } and nothing else');
    return /* @__PURE__ */ new Set();
  }
  if (value.format !== "omp-ui-theme-tags" || value.version !== 1) {
    fail("tags.json", 'format must be "omp-ui-theme-tags" and version 1');
  }
  const tags = value.tags;
  if (!Array.isArray(tags) || tags.length < 1 || tags.length > TAG_VOCABULARY_MAX) {
    fail("tags.json", `tags must list 1 to ${TAG_VOCABULARY_MAX} tags`);
    return /* @__PURE__ */ new Set();
  }
  const vocabulary = /* @__PURE__ */ new Set();
  for (const [i, tag] of tags.entries()) {
    const at = `tag ${i + 1}`;
    if (!isObject(tag) || Array.isArray(tag) || !exactKeys(tag, TAG_KEYS)) {
      fail("tags.json", `${at} must be { "id", "description" } and nothing else`);
      continue;
    }
    if (!isThemeTag(tag.id)) {
      fail("tags.json", `${at}: the id must be lowercase words joined by hyphens, 24 characters at most`);
      continue;
    }
    if (vocabulary.has(tag.id)) fail("tags.json", `${at}: "${tag.id}" is listed twice`);
    if (typeof tag.description !== "string" || tag.description.length < 1 || tag.description.length > THEME_DESCRIPTION_MAX) {
      fail("tags.json", `${at}: the description must be 1 to ${THEME_DESCRIPTION_MAX} characters`);
    }
    vocabulary.add(tag.id);
  }
  return vocabulary;
}
function checkTheme(path2, bytes, detailsPath, detailsBytes, vocabulary, fail) {
  let ok = true;
  const bad = (at, message) => {
    ok = false;
    fail(at, message);
  };
  let theme = null;
  let backdropHash = null;
  const raw = bytes.length > THEME_FILE_BYTES_MAX ? void 0 : plainJson(bytes);
  if (bytes.length > THEME_FILE_BYTES_MAX) {
    bad(path2, "the theme file is larger than 6 MiB");
  } else if (raw === void 0) {
    bad(path2, "must be plain JSON, with no comments or trailing commas");
  } else {
    const parsed = parseThemeFile(decode(bytes));
    if (!parsed.ok) {
      bad(path2, parsed.message);
    } else {
      const label = parsed.draft.label.trim();
      for (const failure of themeGateFailures(sourceFromDraft("custom-check", label, parsed.draft.seeds))) {
        bad(path2, formatGateFailure(failure));
      }
      let kind = null;
      const backdrop = parsed.draft.backdrop;
      if (backdrop !== null && backdrop.from === "bytes") {
        if (!STRICT_BASE64.test(backdrop.data)) {
          bad(path2, "the backdrop data is not strict base64");
        } else {
          const data = Buffer.from(backdrop.data, "base64");
          const check = checkBackdropBytes(data);
          const declared = isObject(raw) && isObject(raw.backdrop) ? raw.backdrop.mime : void 0;
          if (!check.ok) {
            bad(path2, check.message);
          } else if (declared !== check.mime) {
            bad(path2, `the backdrop says it is ${String(declared)} but its bytes are ${check.mime}`);
          } else if (check.kind === "image" && data.length > REPOSITORY_IMAGE_BYTES_MAX) {
            bad(path2, "image backdrops can be at most 1 MiB in this repository");
          } else {
            kind = check.kind;
            backdropHash = createHash("sha256").update(data).digest("hex");
          }
        }
      }
      theme = { path: path2, label, seeds: parsed.draft.seeds, backdrop: kind };
    }
  }
  let details = null;
  const parsedDetails = parseThemeDetails(decode(detailsBytes));
  if (!parsedDetails.ok) {
    bad(detailsPath, parsedDetails.message);
  } else {
    for (const tag of parsedDetails.details.tags) {
      if (!vocabulary.has(tag)) bad(detailsPath, `the tag "${tag}" is not in tags.json`);
    }
    details = parsedDetails.details;
  }
  if (!ok || theme === null || details === null) return null;
  return { theme: { ...theme, details }, backdropHash };
}
function readFeatured(files, themeFiles, fail) {
  const bytes = files.get("featured.json");
  if (bytes === void 0) return [];
  const value = plainJson(bytes);
  if (!isObject(value) || Array.isArray(value) || !exactKeys(value, FEATURED_KEYS)) {
    fail("featured.json", 'must be { "format": "omp-ui-theme-featured", "version": 1, "paths": [...] } and nothing else');
    return [];
  }
  if (value.format !== "omp-ui-theme-featured" || value.version !== 1) {
    fail("featured.json", 'format must be "omp-ui-theme-featured" and version 1');
  }
  const paths = value.paths;
  if (!Array.isArray(paths) || paths.length > FEATURED_MAX) {
    fail("featured.json", `paths must list at most ${FEATURED_MAX} theme files`);
    return [];
  }
  const out = [];
  for (const path2 of paths) {
    if (typeof path2 !== "string" || !themeFiles.has(path2)) {
      fail("featured.json", `${JSON.stringify(path2)} is not a theme file in this repository`);
    } else if (out.includes(path2)) {
      fail("featured.json", `${path2} is listed twice`);
    } else {
      out.push(path2);
    }
  }
  return out;
}
function checkThemeRepository(files) {
  const errors = [];
  const fail = (path2, message) => {
    errors.push(`${path2}: ${message}`);
  };
  const themeFiles = /* @__PURE__ */ new Map();
  const detailsFiles = /* @__PURE__ */ new Map();
  for (const path2 of [...files.keys()].sort()) {
    if (TOP_LEVEL.has(path2) || path2.startsWith(".github/")) continue;
    const inThemes = path2.startsWith("themes/") && !path2.slice("themes/".length).includes("/");
    if (!inThemes || !path2.endsWith(".json")) {
      fail(path2, "not allowed in this repository");
      continue;
    }
    const file = path2.slice("themes/".length);
    const isDetails = file.endsWith(DETAILS_SUFFIX);
    const name = isDetails ? file.slice(0, -DETAILS_SUFFIX.length) : file.slice(0, -".json".length);
    if (!THEME_SLUG.test(name) || name.length > THEME_SLUG_CHARS_MAX) {
      fail(path2, `the file name must be lowercase words joined by hyphens, ${THEME_SLUG_CHARS_MAX} characters at most`);
      continue;
    }
    (isDetails ? detailsFiles : themeFiles).set(name, path2);
  }
  for (const [slug, path2] of themeFiles) {
    if (!detailsFiles.has(slug)) fail(path2, `has no details file themes/${slug}${DETAILS_SUFFIX}`);
  }
  for (const [slug, path2] of detailsFiles) {
    if (!themeFiles.has(slug)) fail(path2, `has no theme file themes/${slug}.json`);
  }
  const vocabulary = readVocabulary(files, fail);
  const checked = [];
  for (const [slug, path2] of [...themeFiles].sort(([, a], [, b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const detailsPath = detailsFiles.get(slug);
    if (detailsPath === void 0) continue;
    const result = checkTheme(path2, files.get(path2), detailsPath, files.get(detailsPath), vocabulary, fail);
    if (result !== null) checked.push(result);
  }
  const labels = /* @__PURE__ */ new Map();
  for (const [i, { theme, backdropHash }] of checked.entries()) {
    const key = theme.label.toLowerCase();
    const first = labels.get(key);
    if (first !== void 0) fail(theme.path, `the label "${theme.label}" is already used by ${first}`);
    else labels.set(key, theme.path);
    const copy = checked.slice(0, i).find((other) => other.backdropHash === backdropHash && sameThemeSeeds(other.theme.seeds, theme.seeds));
    if (copy !== void 0) fail(theme.path, `is a copy of ${copy.theme.path}`);
  }
  const featured = readFeatured(files, new Set(themeFiles.values()), fail);
  if (themeFiles.size > THEME_INDEX_V2_ENTRIES_MAX) {
    fail("themes/", `the repository can hold at most ${THEME_INDEX_V2_ENTRIES_MAX} themes`);
  }
  return { errors, themes: checked.map((c) => c.theme), featured };
}
var fileText = (value) => `${JSON.stringify(value, null, 2)}
`;
function buildThemeIndexes(report2, previousV2, today) {
  if (report2.errors.length > 0) return { ok: false, message: "the repository has errors; run check" };
  const previous = previousV2 === null ? null : parseThemeIndexV2(previousV2);
  const added = /* @__PURE__ */ new Map();
  if (previous !== null && previous.ok) {
    for (const entry of previous.entries) if (entry.meta.added !== null) added.set(entry.path, entry.meta.added);
  }
  const dated = report2.themes.map((theme) => ({ theme, added: added.get(theme.path) ?? today }));
  const featuredRank = new Map(report2.featured.map((path2, i) => [path2, i]));
  dated.sort((a, b) => {
    const fa = featuredRank.get(a.theme.path);
    const fb = featuredRank.get(b.theme.path);
    if (fa !== void 0 || fb !== void 0) {
      if (fa === void 0) return 1;
      if (fb === void 0) return -1;
      return fa - fb;
    }
    if (a.added !== b.added) return a.added < b.added ? -1 : 1;
    return a.theme.path < b.theme.path ? -1 : a.theme.path > b.theme.path ? 1 : 0;
  });
  const v2 = fileText({
    format: THEME_INDEX_FORMAT,
    version: THEME_INDEX_V2_VERSION,
    themes: dated.map(({ theme, added: date }) => ({
      path: theme.path,
      label: theme.label,
      seeds: theme.seeds,
      backdrop: theme.backdrop,
      tags: theme.details.tags,
      description: theme.details.description,
      ...theme.details.author !== null ? { author: theme.details.author } : {},
      added: date,
      featured: featuredRank.has(theme.path)
    }))
  });
  if (Buffer.byteLength(v2, "utf8") > THEME_INDEX_V2_BYTES_MAX) {
    return { ok: false, message: "omp-ui-themes.v2.json would be larger than 512 KiB" };
  }
  const v1Entries = [];
  const v1Of = (themes) => fileText({ format: THEME_INDEX_FORMAT, version: THEME_INDEX_VERSION, themes });
  let v1 = v1Of(v1Entries);
  for (const { theme } of dated) {
    if (v1Entries.length === THEME_INDEX_ENTRIES_MAX) break;
    const next = [...v1Entries, { path: theme.path, label: theme.label, seeds: theme.seeds, backdrop: theme.backdrop }];
    const text = v1Of(next);
    if (Buffer.byteLength(text, "utf8") > THEME_INDEX_BYTES_MAX) break;
    v1Entries.push(next[next.length - 1]);
    v1 = text;
  }
  return { ok: true, v1, v2 };
}

// packages/core/src/theme-repository-cli.ts
var USAGE = "usage: omp-ui-theme-tool <check|generate> <repository-dir>";
async function readRepository(dir) {
  const files = /* @__PURE__ */ new Map();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const relative = path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
    if (relative === ".git" || relative.startsWith(".git/")) continue;
    files.set(relative, await readFile(path.join(dir, relative)));
  }
  return files;
}
function report(result, io) {
  const errors = [...result.errors];
  if (errors.length === 0) {
    const dry = buildThemeIndexes(result, null, "1970-01-01");
    if (!dry.ok) errors.push(dry.message);
  }
  for (const line of errors) io.err(line);
  io.out(`${result.themes.length} themes, ${errors.length} errors`);
  return errors.length === 0;
}
async function runThemeRepositoryCli(argv, io) {
  const [command, dir, ...rest] = argv;
  if (command !== "check" && command !== "generate" || dir === void 0 || rest.length > 0) {
    io.err(USAGE);
    return 2;
  }
  const files = await readRepository(dir);
  const result = checkThemeRepository(files);
  if (!report(result, io)) return 1;
  if (command === "check") return 0;
  const previous = files.get(THEME_INDEX_V2_FILE);
  const built = buildThemeIndexes(
    result,
    previous === void 0 ? null : new TextDecoder().decode(previous),
    (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  );
  if (!built.ok) {
    io.err(built.message);
    return 1;
  }
  await writeFile(path.join(dir, THEME_INDEX_FILE), built.v1);
  await writeFile(path.join(dir, THEME_INDEX_V2_FILE), built.v2);
  const v1 = parseThemeIndex(built.v1);
  const v2 = parseThemeIndexV2(built.v2);
  io.out(`${THEME_INDEX_FILE}: ${v1.ok ? v1.entries.length : 0} themes`);
  io.out(`${THEME_INDEX_V2_FILE}: ${v2.ok ? v2.entries.length : 0} themes`);
  return 0;
}

// omp-ui-theme-tool-entry.mjs
process.exitCode = await runThemeRepositoryCli(process.argv.slice(2), {
  out: (line) => console.log(line),
  err: (line) => console.error(line)
});
