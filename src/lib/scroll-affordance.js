// Auto-fade scrollbars: while an element is being scrolled, tag it with
// `is-scrolling` so its (normally faint) scrollbar brightens, then clear the tag
// shortly after scrolling stops. The scrollbar styling itself lives in index.css.
//
// Scroll events don't bubble, so we listen in the CAPTURE phase at the document to
// catch every scroll container — the page, the pipeline board, tables, modals, menus.
let installed = false;

export function installScrollAffordance() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const timers = new WeakMap();
  const onScroll = (e) => {
    // Body/page scroll targets `document`; tag the <html> element in that case.
    const el = e.target === document ? document.documentElement : e.target;
    if (!el || el.nodeType !== 1) return; // element nodes only
    el.classList.add("is-scrolling");
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => el.classList.remove("is-scrolling"), 700));
  };
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
}
