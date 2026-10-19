/* 内联 SVG 图标精灵。全站不使用 emoji 作为图标。 */
const ICONS = {
  catalog: '<path d="M12 3.2 3.4 8 12 12.8 20.6 8 12 3.2Z"/><path d="M3.4 12.4 12 17.2l8.6-4.8"/><path d="M3.4 16.6 12 21.4l8.6-4.8"/>',
  cap: '<path d="M2.8 8.6 12 4.2l9.2 4.4L12 13 2.8 8.6Z"/><path d="M6.4 10.6v4.2c0 1.5 2.5 2.7 5.6 2.7s5.6-1.2 5.6-2.7v-4.2"/><path d="M21.2 8.6v5.2"/>',
  users: '<path d="M15.6 20.4v-1.6a4 4 0 0 0-4-4H6.4a4 4 0 0 0-4 4v1.6"/><circle cx="9" cy="9.8" r="3.8"/><path d="M17 5.2a3.8 3.8 0 0 1 0 7.4"/><path d="M21.6 20.4v-1.6a4 4 0 0 0-3-3.86"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0"/>',
  audit: '<path d="M13.6 3.2H7.2a2.2 2.2 0 0 0-2.2 2.2v13.2a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2V8.4l-5.4-5.2Z"/><path d="M13.6 3.2v5.2h5.4"/><path d="M8.6 13h6.8"/><path d="M8.6 17h4.4"/>',
  file: '<path d="M13.6 3.2H7.2a2.2 2.2 0 0 0-2.2 2.2v13.2a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2V8.4l-5.4-5.2Z"/><path d="M13.6 3.2v5.2h5.4"/>',
  settings: '<path d="M5.6 20.4V14.2"/><path d="M5.6 9.6V3.6"/><path d="M12 20.4v-3.4"/><path d="M12 13.2V3.6"/><path d="M18.4 20.4v-7.2"/><path d="M18.4 9.4V3.6"/><circle cx="5.6" cy="11.9" r="2.1"/><circle cx="12" cy="15.5" r="2.1"/><circle cx="18.4" cy="11.1" r="2.1"/>',
  plus: '<path d="M12 5.2v13.6"/><path d="M5.2 12h13.6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 21 21"/>',
  lock: '<path d="M6.4 10.8h11.2a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6H6.4a1.6 1.6 0 0 1-1.6-1.6v-7.2a1.6 1.6 0 0 1 1.6-1.6Z"/><path d="M8.6 10.8V7.8a3.4 3.4 0 0 1 6.8 0v3"/>',
  check: '<path d="M4.4 12.6 9.2 17.4 19.6 6.6"/>',
  x: '<path d="M6.2 6.2 17.8 17.8"/><path d="M17.8 6.2 6.2 17.8"/>',
  eye: '<path d="M1.8 12S5.7 5.2 12 5.2 22.2 12 22.2 12 18.3 18.8 12 18.8 1.8 12 1.8 12Z"/><circle cx="12" cy="12" r="3.1"/>',
  download: '<path d="M12 3.8v10.4"/><path d="M7.6 10.2 12 14.6l4.4-4.4"/><path d="M4.2 19.4h15.6"/>',
  upload: '<path d="M12 15.4V5"/><path d="M7.6 9.4 12 5l4.4 4.4"/><path d="M4.2 19.4h15.6"/>',
  trash: '<path d="M4.4 6.8h15.2"/><path d="M9.4 6.8V4.6h5.2v2.2"/><path d="M6.8 6.8l.76 12.1a2 2 0 0 0 2 1.9h4.9a2 2 0 0 0 2-1.9l.76-12.1"/><path d="M10.4 10.8v6.6"/><path d="M13.6 10.8v6.6"/>',
  back: '<path d="M14.6 5.4 8 12l6.6 6.6"/>',
  next: '<path d="M9.4 5.4 16 12l-6.6 6.6"/>',
  shield: '<path d="M12 3 20 6v5.6c0 4.9-3.4 7.9-8 9.4-4.6-1.5-8-4.5-8-9.4V6l8-3Z"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5.4"/><path d="M12 7.8v.4"/>',
  spark: '<path d="M12 3.2l1.9 5.4 5.4 1.9-5.4 1.9L12 17.8l-1.9-5.4L4.7 10.5l5.4-1.9L12 3.2Z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4"/>',
  layers: '<path d="M12 3.4 4 7.8l8 4.4 8-4.4-8-4.4Z"/><path d="M4 12.2l8 4.4 8-4.4"/><path d="M4 16.6l8 4.4 8-4.4"/>',
};

function icon(name, cls) {
  if (!ICONS[name]) return '';
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<use href="#i-' + name + '"></use></svg>';
}

function injectIconSprite() {
  const symbols = Object.keys(ICONS).map(function (name) {
    return '<symbol id="i-' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</symbol>';
  }).join('');
  const sprite = '<svg class="sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + symbols + '</svg>';
  document.body.insertAdjacentHTML('afterbegin', sprite);
}

if (typeof window !== 'undefined') {
  window.ICONS = ICONS;
  window.icon = icon;
  window.injectIconSprite = injectIconSprite;
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { ICONS, icon, injectIconSprite }; }
