/* A round color wheel: hue around the edge, saturation toward the center, brightness on a slider */
(() => {
  'use strict';
  const SB = window.SideB;
  const { U } = SB;

  SB.ColorWheel = function ColorWheel(root, onChange) {
    const SIZE = 200;
    root.innerHTML = `
      <div class="cw-wheel" tabindex="0" role="slider" aria-label="Color wheel. Use arrow keys to change hue and saturation.">
        <canvas></canvas><span class="cw-dot"></span>
      </div>
      <div class="cw-row">
        <input class="cw-val" type="range" min="0" max="100" step="1" aria-label="Brightness">
        <input class="cw-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex color">
      </div>`;
    const wheel = root.querySelector('.cw-wheel');
    const canvas = root.querySelector('canvas');
    const dot = root.querySelector('.cw-dot');
    const val = root.querySelector('.cw-val');
    const hexIn = root.querySelector('.cw-hex');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(SIZE * dpr);
    const ctx = canvas.getContext('2d');

    let h = 0, s = 0, v = 1, drawnV = -1;

    function draw() {
      if (drawnV === v) return;
      drawnV = v;
      const W = canvas.width, r = W / 2;
      const img = ctx.createImageData(W, W), d = img.data;
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x + 0.5 - r, dy = y + 0.5 - r, dist = Math.hypot(dx, dy);
          if (dist > r + 1) continue;
          const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
          const [R, G, B] = U.hsvToRgb(hue, Math.min(1, dist / r), v);
          const k = (y * W + x) * 4;
          d[k] = R; d[k + 1] = G; d[k + 2] = B;
          d[k + 3] = Math.round(U.clamp(r - dist + 0.5, 0, 1) * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    const hex = () => U.rgbToHex(...U.hsvToRgb(h, s, v));

    function place() {
      const a = (h * Math.PI) / 180, R = SIZE / 2;
      dot.style.left = R + Math.cos(a) * s * R + 'px';
      dot.style.top = R + Math.sin(a) * s * R + 'px';
      dot.style.background = hex();
      val.style.setProperty('--track', `linear-gradient(to right, #000, ${U.rgbToHex(...U.hsvToRgb(h, s, 1))})`);
      val.value = Math.round(v * 100);
      if (document.activeElement !== hexIn) hexIn.value = hex().toUpperCase();
      wheel.setAttribute('aria-valuetext', hex().toUpperCase());
    }

    function emit() { place(); if (onChange) onChange(hex()); }

    function fromPointer(e) {
      const rect = canvas.getBoundingClientRect();
      const R = rect.width / 2;
      const dx = e.clientX - rect.left - R, dy = e.clientY - rect.top - R;
      h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      s = Math.min(1, Math.hypot(dx, dy) / R);
      emit();
    }

    wheel.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      wheel.setPointerCapture(e.pointerId);
      wheel.focus({ preventScroll: true });
      fromPointer(e);
    });
    wheel.addEventListener('pointermove', (e) => { if (wheel.hasPointerCapture(e.pointerId)) fromPointer(e); });
    wheel.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 3 : 1;
      if (e.key === 'ArrowLeft') h = (h - 4 * step + 360) % 360;
      else if (e.key === 'ArrowRight') h = (h + 4 * step) % 360;
      else if (e.key === 'ArrowUp') s = U.clamp(s + 0.04 * step, 0, 1);
      else if (e.key === 'ArrowDown') s = U.clamp(s - 0.04 * step, 0, 1);
      else return;
      e.preventDefault();
      emit();
    });

    val.addEventListener('input', () => { v = val.value / 100; draw(); emit(); });

    hexIn.addEventListener('input', () => {
      const raw = hexIn.value.trim();
      if (raw.replace('#', '').length !== 6) return;
      const rgb = U.hexToRgb(raw);
      if (!rgb) return;
      [h, s, v] = U.rgbToHsv(...rgb);
      draw();
      place();
      if (onChange) onChange(U.rgbToHex(...rgb));
    });
    hexIn.addEventListener('blur', place);

    return {
      set(hexStr) {
        const rgb = U.hexToRgb(hexStr);
        if (!rgb) return;
        [h, s, v] = U.rgbToHsv(...rgb);
        draw();
        place();
      },
      get: hex
    };
  };
})();
