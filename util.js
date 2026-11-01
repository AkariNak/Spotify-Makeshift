/* Shared helpers: storage, formatting, color math, icons */
(() => {
  'use strict';
  const SB = window.SideB;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('sideb:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('sideb:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const longDuration = (s) => {
    s = Math.round(s);
    if (s < 60) return `${s} sec`;
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? `${h} hr ${m} min` : `${m} min`;
  };

  const stripExt = (p) => p.replace(/\.[^./]+$/, '');
  const fileOf = (p) => p.split('/').pop();
  const dirOf = (p) => p.split('/').slice(0, -1).join('/');
  const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
  const hueOf = (str) => { let h = 7; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 3600; return h % 360; };
  const initials = (t) => (t || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '♪';
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  function parseName(name) {
    let base = stripExt(name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    base = base.replace(/^\d{1,3}\s*[.\-)]\s*|^\d{1,3}\s+(?=\D)/, '').trim();
    const parts = base.split(/\s+[-–]\s+/);
    if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    return { artist: '', title: base };
  }

  /* ----- color ----- */
  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
  function hsvToRgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, max ? d / max : 0, max];
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }

  /* Average hue of a set of colors, weighted toward the vivid ones */
  function accentFromRgbList(list) {
    let sx = 0, sy = 0, ws = 0, wt = 0;
    for (const [r, g, b] of list) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const w = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.6) + 0.0001;
      sx += Math.cos(h * Math.PI / 180) * w;
      sy += Math.sin(h * Math.PI / 180) * w;
      ws += s * w; wt += w;
    }
    const sat = wt ? ws / wt : 0;
    const hue = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
    return { h: Math.round(hue), s: sat < 0.1 ? 8 : Math.round(clamp(sat * 100, 35, 90)) };
  }
  const accentFromColors = (colors) => accentFromRgbList(colors.map(hexToRgb).filter(Boolean));

  function accentFromImage(url, cb, fallback) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 20;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 20, 20);
        const d = x.getImageData(0, 0, 20, 20).data;
        const list = [];
        for (let i = 0; i < d.length; i += 4) list.push([d[i], d[i + 1], d[i + 2]]);
        cb(accentFromRgbList(list));
      } catch { cb(fallback); }
    };
    img.onerror = () => cb(fallback);
    img.src = url;
  }

  /* CSS background-image for a custom cover */
  function coverBackground(c) {
    if (!c) return '';
    if (c.type === 'gradient') return `linear-gradient(${c.angle ?? 135}deg, ${c.colors[0]}, ${c.colors[1]})`;
    return `linear-gradient(${c.colors[0]}, ${c.colors[0]})`;
  }

  /* Draws a custom cover to a PNG (used for lock screen artwork) */
  function coverDataUrl(c, size = 512) {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const x = cv.getContext('2d');
      if (c.type === 'gradient') {
        const a = ((c.angle ?? 135) * Math.PI) / 180;
        const dx = Math.sin(a), dy = -Math.cos(a);
        const half = ((Math.abs(dx) + Math.abs(dy)) * size) / 2, mid = size / 2;
        const g = x.createLinearGradient(mid - dx * half, mid - dy * half, mid + dx * half, mid + dy * half);
        g.addColorStop(0, c.colors[0]);
        g.addColorStop(1, c.colors[1]);
        x.fillStyle = g;
      } else {
        x.fillStyle = c.colors[0];
      }
      x.fillRect(0, 0, size, size);
      return cv.toDataURL('image/png');
    } catch { return ''; }
  }

  const stroke = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5.5v13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path fill="currentColor" d="M19 6.3v11.4a.9.9 0 0 1-1.4.75l-8.2-5.45a1.2 1.2 0 0 1 0-2l8.2-5.45A.9.9 0 0 1 19 6.3z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5.5v13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path fill="currentColor" d="M5 6.3v11.4a.9.9 0 0 0 1.4.75l8.2-5.45a1.2 1.2 0 0 0 0-2L6.4 5.55A.9.9 0 0 0 5 6.3z"/></svg>',
    shuffle: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/></svg>`,
    repeat: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
    repeatOne: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10.5h1.2v4" stroke-width="1.8"/></svg>`,
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    down: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
    search: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
    close: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    palette: `<svg viewBox="0 0 24 24" ${stroke} aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="10" cy="7.5" r=".6" fill="currentColor"/><circle cx="14.5" cy="7.5" r=".6" fill="currentColor"/></svg>`
  };

  SB.store = store;
  SB.ICONS = ICONS;
  SB.U = {
    clamp, fmt, longDuration, stripExt, fileOf, dirOf, encodePath, hueOf, initials, collator, parseName,
    hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, rgbToHsl, hslToHex,
    accentFromColors, accentFromImage, coverBackground, coverDataUrl
  };
})();
