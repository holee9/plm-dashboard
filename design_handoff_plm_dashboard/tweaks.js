/* =============================================================================
   PLM Dashboard — Tweaks panel (vanilla, host protocol)
   ========================================================================== */
(function () {
  'use strict';

  const ACCENT_SW = { blue: '#3B82F6', violet: '#8B5CF6', teal: '#14B8A6', amber: '#F59E0B', rose: '#EC4899' };
  const STYLES = [['telemetry', 'Telemetry', 'Grafana 톤 · 하어라인'], ['console', 'Console', '고대비 · 각진 모노'], ['studio', 'Studio', '부드러운 카드 · 그림자']];
  const DENSITY = [['compact', 'Compact'], ['cozy', 'Cozy'], ['comfortable', 'Comfortable']];
  const THEME = [['dark', 'Dark'], ['light', 'Light']];

  // panel element
  const panel = document.createElement('div');
  panel.id = 'tweaks-panel';
  panel.style.cssText = `position:fixed;right:18px;bottom:18px;width:300px;z-index:9999;display:none;
    background:var(--panel);border:1px solid var(--border-strong);border-radius:12px;
    box-shadow:0 12px 40px rgba(0,0,0,.4);font-family:'IBM Plex Sans KR',sans-serif;overflow:hidden`;
  document.body.appendChild(panel);

  const A = () => window.App;

  function seg(key, options) {
    const cur = A().get(key);
    return `<div class="seg" style="width:100%">${options.map(([v, lbl]) =>
      `<button class="${cur === v ? 'on' : ''}" data-tw="${key}" data-val="${v}" style="flex:1;font-size:11.5px;padding:6px 4px">${lbl}</button>`).join('')}</div>`;
  }
  function styleCards() {
    const cur = A().get('style');
    return `<div style="display:flex;flex-direction:column;gap:6px">${STYLES.map(([v, lbl, desc]) =>
      `<button data-tw="style" data-val="${v}" style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:8px;border:1px solid ${cur === v ? 'var(--accent)' : 'var(--border)'};background:${cur === v ? 'var(--accent-soft)' : 'var(--panel-2)'};text-align:left">
        <span style="width:8px;height:8px;border-radius:50%;background:${cur === v ? 'var(--accent)' : 'var(--text-faint)'};flex:0 0 auto"></span>
        <span style="flex:1"><b style="font-size:12.5px;display:block;color:var(--text)">${lbl}</b><span style="font-size:10.5px;color:var(--text-faint)">${desc}</span></span></button>`).join('')}</div>`;
  }
  function swatches() {
    const cur = A().get('accent');
    return `<div style="display:flex;gap:8px">${Object.entries(ACCENT_SW).map(([k, hex]) =>
      `<button data-tw="accent" data-val="${k}" title="${k}" style="width:32px;height:32px;border-radius:8px;background:${hex};border:2px solid ${cur === k ? 'var(--text)' : 'transparent'};box-shadow:0 0 0 1px var(--border)"></button>`).join('')}</div>`;
  }

  function label(t) { return `<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-faint);font-family:'IBM Plex Mono',monospace;margin-bottom:8px">${t}</div>`; }

  function render() {
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:13px 15px;border-bottom:1px solid var(--border)">
        <b style="font-size:13px;color:var(--text)">Tweaks</b>
        <span style="font-size:10.5px;color:var(--text-faint);font-family:'IBM Plex Mono',monospace">실시간 미리보기</span>
        <span style="flex:1"></span>
        <button data-tw-close style="width:24px;height:24px;border-radius:6px;display:grid;place-items:center;color:var(--text-faint)">✕</button>
      </div>
      <div style="padding:15px;display:flex;flex-direction:column;gap:16px;max-height:70vh;overflow-y:auto">
        <div>${label('Style Direction · 방향 비교')}${styleCards()}</div>
        <div>${label('Accent · 강조 색상')}${swatches()}</div>
        <div>${label('Density · 정보 밀도')}${seg('density', DENSITY)}</div>
        <div>${label('Theme · 테마')}${seg('theme', THEME)}</div>
      </div>`;
  }

  // listener BEFORE announcing availability
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === '__activate_edit_mode') { panel.style.display = 'block'; render(); }
    if (d.type === '__deactivate_edit_mode') { panel.style.display = 'none'; }
  });
  window.parent.postMessage({ type: '__edit_mode_available' }, '*');

  panel.addEventListener('click', (e) => {
    const close = e.target.closest('[data-tw-close]');
    if (close) { panel.style.display = 'none'; window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); return; }
    const btn = e.target.closest('[data-tw]');
    if (!btn) return;
    const key = btn.dataset.tw, val = btn.dataset.val;
    A().set(key, val);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, '*');
    render();
  });
})();
