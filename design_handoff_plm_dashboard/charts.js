/* =============================================================================
   PLM Dashboard — SVG chart helpers (no external dependencies)
   Every helper returns an SVG markup string. Interactive segments carry a
   data-tip attribute; app.js wires a single global tooltip.
   ========================================================================== */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/"/g, '&quot;');
  const pol = (cx, cy, r, ang) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];

  // ---- DONUT ---------------------------------------------------------------
  function donut(opts) {
    const { segments, size = 168, thickness = 24, centerTop = '', centerBottom = '' } = opts;
    const total = segments.reduce((a, s) => a + s.value, 0) || 1;
    const r = (size - thickness) / 2;
    const cx = size / 2, cy = size / 2;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    let arcs = '';
    segments.forEach((s) => {
      if (s.value <= 0) return;
      const frac = s.value / total;
      const len = frac * circ;
      const gap = 2; // px gap between segments
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${s.color}" stroke-width="${thickness}"
        stroke-dasharray="${Math.max(0, len - gap)} ${circ - Math.max(0, len - gap)}"
        stroke-dashoffset="${-offset}"
        data-tip="${esc(s.label)} · ${s.value} (${Math.round(frac * 100)}%)"
        style="cursor:pointer;transition:opacity .12s" class="seg-arc"/>`;
      offset += len;
    });
    return `<div class="donut-wrap" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--panel-2)" stroke-width="${thickness}"/>
        ${arcs}
      </svg>
      <div class="donut-center"><b>${centerTop}</b><span>${centerBottom}</span></div>
    </div>`;
  }

  // ---- SPARKLINE -----------------------------------------------------------
  function sparkline(values, opts = {}) {
    const { w = 120, h = 40, color = 'var(--accent)', fill = true, sw = 1.8 } = opts;
    if (!values.length) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const step = w / (values.length - 1 || 1);
    const pts = values.map((v, i) => [i * step, h - 4 - ((v - min) / span) * (h - 8)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;
    const id = 'sg' + Math.random().toString(36).slice(2, 7);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      ${fill ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
        <path d="${area}" fill="url(#${id})"/>` : ''}
      <path d="${line}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  // ---- LINE / AREA (multi-series with axes) --------------------------------
  function lines(opts) {
    const { series, labels, w = 600, h = 240, yMax: yMaxIn, area = false, yLabel = '' } = opts;
    const padL = 38, padR = 12, padT = 12, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    let yMax = yMaxIn || Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
    yMax = Math.ceil(yMax / 5) * 5 || 5;
    const n = labels.length;
    const xAt = (i) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const yAt = (v) => padT + ih - (v / yMax) * ih;

    // gridlines
    let grid = '';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = (yMax / steps) * i;
      const y = yAt(v);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--grid-line)"/>
        <text x="${padL - 7}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--text-faint)" font-family="IBM Plex Mono">${Math.round(v)}</text>`;
    }
    // x labels (thin out)
    let xlab = '';
    const every = Math.ceil(n / 8);
    labels.forEach((l, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      xlab += `<text x="${xAt(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9.5" fill="var(--text-faint)" font-family="IBM Plex Mono">${l}</text>`;
    });

    let paths = '', dots = '';
    series.forEach((s) => {
      const idg = 'lg' + Math.random().toString(36).slice(2, 7);
      // break at nulls
      let segs = [], cur = [];
      s.values.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([xAt(i), yAt(v)]); });
      if (cur.length) segs.push(cur);
      segs.forEach((seg) => {
        const d = seg.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        if (area && seg.length) {
          paths += `<defs><linearGradient id="${idg}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${s.color}" stop-opacity="0.22"/>
            <stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>
            <path d="${d} L ${seg[seg.length - 1][0].toFixed(1)} ${padT + ih} L ${seg[0][0].toFixed(1)} ${padT + ih} Z" fill="url(#${idg})"/>`;
        }
        paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="5 4" opacity="0.7"' : ''}/>`;
      });
      // dots with tips
      s.values.forEach((v, i) => {
        if (v == null) return;
        dots += `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="3" fill="var(--panel)" stroke="${s.color}" stroke-width="2"
          data-tip="${esc(s.name + ' · ' + labels[i] + ': ' + v + (yLabel ? yLabel : ''))}" style="cursor:pointer"/>`;
      });
    });
    return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="display:block">
      ${grid}${paths}${dots}${xlab}</svg>`;
  }

  // ---- GROUPED COLUMNS (e.g. opened vs closed per week) --------------------
  function columns(opts) {
    const { groups, series, w = 600, h = 240 } = opts; // groups:[{label, values:[..]}]
    const padL = 34, padR = 10, padT = 12, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const yMaxRaw = Math.max(1, ...groups.flatMap((g) => g.values));
    const yMax = Math.ceil(yMaxRaw / 5) * 5 || 5;
    const yAt = (v) => padT + ih - (v / yMax) * ih;
    const gw = iw / groups.length;
    const nb = series.length;
    const bw = Math.min(14, (gw * 0.7) / nb);

    let grid = '';
    for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; const y = yAt(v);
      grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--grid-line)"/>
        <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--text-faint)" font-family="IBM Plex Mono">${Math.round(v)}</text>`; }
    let bars = '', xlab = '';
    const every = Math.ceil(groups.length / 9);
    groups.forEach((g, gi) => {
      const cx = padL + gi * gw + gw / 2;
      g.values.forEach((v, si) => {
        const x = cx - (nb * bw) / 2 + si * bw;
        const y = yAt(v);
        const bh = padT + ih - y;
        bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="2" fill="${series[si].color}"
          data-tip="${esc(series[si].name + ' · ' + g.label + ': ' + v)}" style="cursor:pointer"/>`;
      });
      if (gi % every === 0 || gi === groups.length - 1)
        xlab += `<text x="${cx.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9.5" fill="var(--text-faint)" font-family="IBM Plex Mono">${g.label}</text>`;
    });
    return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="display:block">${grid}${bars}${xlab}</svg>`;
  }

  // ---- HORIZONTAL BARS (utilisation / activity) ----------------------------
  // rows: [{label, value, max, color, segments?:[{value,color,name}], right}]
  function hbars(opts) {
    const { rows, valueFmt = (v) => v } = opts;
    return `<div style="display:flex;flex-direction:column;gap:10px">` + rows.map((r) => {
      const max = r.max || Math.max(...rows.map((x) => x.value)) || 1;
      let fill;
      if (r.segments) {
        let x = 0;
        fill = r.segments.map((s) => { const wpct = (s.value / max) * 100; const seg = `<span data-tip="${esc(s.name + ': ' + valueFmt(s.value))}" style="left:${x}%;width:${wpct}%;background:${s.color};cursor:pointer"></span>`; x += wpct; return seg; }).join('');
      } else {
        fill = `<span style="left:0;width:${Math.min(100, (r.value / max) * 100)}%;background:${r.color}"></span>`;
      }
      const cap = r.capPct != null ? `<i class="cap" style="left:${r.capPct}%"></i>` : '';
      return `<div style="display:flex;align-items:center;gap:10px">
        <div style="width:96px;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-dim);overflow:hidden;white-space:nowrap;flex:0 0 auto">${r.label}</div>
        <div class="loadbar" style="flex:1">${fill}${cap}</div>
        <div class="mono" style="width:${r.right ? '64px' : '40px'};text-align:right;font-size:11.5px;color:var(--text);flex:0 0 auto">${r.right || valueFmt(r.value)}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  window.Charts = { donut, sparkline, lines, columns, hbars };
})();
