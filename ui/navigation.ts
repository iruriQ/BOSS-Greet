import { useCallback, useEffect, useRef } from "react";
import { usePanelStore } from "./store";

// Track sections inside the assistant, never the recruiting page. A navigation
// click owns its highlight until the scroll settles; manual scrolling cancels it.
export function useSectionNavigation(element: HTMLElement, enabled: boolean, layoutKey: string, reducedMotion: boolean | null) {
  const intent = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const releaseIntent = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { intent.current = false; }, 180);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const content = element.querySelector<HTMLElement>(".nova-content");
    if (!content) return;
    let frame = 0;
    const setActive = (id: string) => {
      if (usePanelStore.getState().activeNav !== id) usePanelStore.getState().setNav(id);
    };
    const sync = () => {
      frame = 0;
      if (intent.current) return;
      if (content.scrollTop <= 2) {
        const first = content.querySelector<HTMLElement>('[data-card="filters"], [data-card="greeting"]');
        if (first?.dataset.card) setActive(first.dataset.card);
        return;
      }
      const viewport = content.getBoundingClientRect(), line = viewport.top + 26;
      const visible = Array.from(content.querySelectorAll<HTMLElement>('[data-card="filters"], [data-card="greeting"], [data-card="logs"]'))
        .map(node => ({ id: node.dataset.card!, box: node.getBoundingClientRect() }))
        .filter(({ box }) => box.height > 0 && box.bottom > viewport.top + 4 && box.top < viewport.bottom - 12);
      // Preview belongs to the greeting wrapper, so it keeps the same highlight.
      const crossed = visible.filter(({ box }) => box.top <= line && box.bottom > line)
        .sort((a, b) => b.box.top - a.box.top);
      const atEnd = content.scrollHeight - content.clientHeight - content.scrollTop <= 2;
      const current = atEnd ? [...visible].sort((a, b) => b.box.top - a.box.top)[0]
        : crossed[0] || [...visible].sort((a, b) => a.box.top - b.box.top)[0];
      if (current) setActive(current.id);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    const onScroll = () => { if (intent.current) releaseIntent(); else schedule(); };
    const onManual = () => { intent.current = false; clearTimeout(timer.current); schedule(); };
    content.addEventListener("scroll", onScroll, { passive: true });
    content.addEventListener("wheel", onManual, { passive: true });
    content.addEventListener("touchstart", onManual, { passive: true });
    content.addEventListener("pointerdown", onManual);
    const onKey = (event: KeyboardEvent) => { if (["PageDown", "PageUp", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(event.key)) onManual(); };
    content.addEventListener("keydown", onKey);
    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    content.querySelectorAll<HTMLElement>(".nova-workspace, .nova-sortable").forEach(node => observer.observe(node));
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      content.removeEventListener("scroll", onScroll);
      content.removeEventListener("wheel", onManual);
      content.removeEventListener("touchstart", onManual);
      content.removeEventListener("pointerdown", onManual);
      content.removeEventListener("keydown", onKey);
      clearTimeout(timer.current); intent.current = false;
    };
  }, [element, enabled, layoutKey, releaseIntent]);
  return useCallback((id: string) => {
    const content = element.querySelector<HTMLElement>(".nova-content");
    const target = element.querySelector<HTMLElement>(`[data-card="${id}"]`);
    if (!content || !target) return;
    intent.current = true;
    usePanelStore.getState().setNav(id);
    content.scrollTo({ top: content.scrollTop + target.getBoundingClientRect().top - content.getBoundingClientRect().top - 14,
      behavior: reducedMotion ? "instant" : "smooth" });
    releaseIntent();
  }, [element, reducedMotion, releaseIntent]);
}
