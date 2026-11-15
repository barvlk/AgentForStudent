// أيقونات خطية بسيطة (SVG) بدل الإيموجي — مظهر رسمي ومتناسق.
const P = {
  book: '<path d="M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4z"/><path d="M20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  layers: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 12.5l9 4.5 9-4.5"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  send: '<path d="M20 4L4 11l6 2.5L12.5 20z"/><path d="M10 13.5L20 4"/>',
  key: '<circle cx="8" cy="14" r="3.5"/><path d="M10.5 11.5L19 3M16 6l2.5 2.5"/>',
  logout: '<path d="M9 4H5v16h4"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  inbox: '<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
};

export const icon = (name) =>
  `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${P[name] ?? ''}</svg>`;
