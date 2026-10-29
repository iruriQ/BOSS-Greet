import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Preferences } from './types';
type Bounds = NonNullable<Preferences['windowBounds']>;
type Gesture = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const inset = 8;
function clampBounds(bounds: Bounds, collapsedHeight = 0): Bounds {
  const maxWidth = Math.max(1, window.innerWidth - inset * 2);
  const maxHeight = Math.max(1, window.innerHeight - inset * 2);
  const width = Math.max(Math.min(320, maxWidth), Math.min(bounds.width, maxWidth));
  const height = Math.max(Math.min(360, maxHeight), Math.min(bounds.height, maxHeight));
  return { width, height, x: Math.max(inset, Math.min(bounds.x, window.innerWidth - (collapsedHeight ? Math.min(width, 330) : width) - inset)),
    y: Math.max(inset, Math.min(bounds.y, window.innerHeight - (collapsedHeight || height) - inset)) };
}
function paint(host: HTMLElement, bounds: Bounds, collapsed = false) {
  Object.assign(host.style, { left: `${bounds.x}px`, top: `${bounds.y}px`, bottom: 'auto', right: 'auto',
    width: `${collapsed ? Math.min(bounds.width, 330) : bounds.width}px`, height: collapsed ? 'auto' : `${bounds.height}px`, maxHeight: `${window.innerHeight - inset * 2}px` });
}
export function useFloatingWindow(host: HTMLElement, preferences: Preferences, collapsed: boolean,
  persist: (patch: Partial<Preferences>) => void) {
  const [wide, setWide] = useState(false);
  const latest = useRef({ preferences, collapsed, persist });
  latest.current = { preferences, collapsed, persist };
  const cancel = useRef<null | (() => void)>(null);
  useEffect(() => {
    function place() {
      const { preferences, collapsed } = latest.current;
      const bounds = clampBounds(preferences.windowBounds || {
        x: 18, y: Math.max(inset, window.innerHeight - Math.min(900, window.innerHeight - 36) - 18),
        width: preferences.expanded ? 1190 : 438, height: Math.min(900, window.innerHeight - 36),
      }, collapsed ? host.querySelector(".nova-header")?.getBoundingClientRect().height || 80 : 0);
      paint(host, bounds, collapsed);
      // A smaller viewport never leaves the title bar outside the screen.
      setWide(bounds.width >= 850);
    }
    place();
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(() => setWide(host.getBoundingClientRect().width >= 850));
    observer.observe(host);
    return () => { window.removeEventListener('resize', place); observer.disconnect(); cancel.current?.(); };
  }, [host, preferences.windowBounds, preferences.expanded, collapsed]);
  function startGesture(event: ReactPointerEvent, mode: Gesture) {
    if (event.button !== 0 || (mode === 'move' && (event.target as HTMLElement).closest('button, input, a'))) return;
    event.preventDefault(); event.stopPropagation();
    cancel.current?.();
    const rect = host.getBoundingClientRect();
    const start = { x: rect.x, y: rect.y, width: latest.current.collapsed ? latest.current.preferences.windowBounds?.width || (latest.current.preferences.expanded ? 1190 : 438) : rect.width,
      height: latest.current.collapsed ? latest.current.preferences.windowBounds?.height || 700 : rect.height };
    const x = event.clientX, y = event.clientY;
    let next = start;
    const pointerId = event.pointerId;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(pointerId);
    host.dataset.gesturing = 'true';
    const previousSelect = document.documentElement.style.userSelect;
    document.documentElement.style.userSelect = 'none';
    function move(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - x, dy = e.clientY - y;
      if (mode === 'move') {
        // While collapsed, clamp the visible header rather than the saved full height.
        next = { ...start, x: Math.max(inset, Math.min(start.x + dx, window.innerWidth - (latest.current.collapsed ? rect.width : start.width) - inset)),
          y: Math.max(inset, Math.min(start.y + dy, window.innerHeight - (latest.current.collapsed ? rect.height : start.height) - inset)) };
      } else {
        const minW = Math.min(320, window.innerWidth - 16), minH = Math.min(360, window.innerHeight - 16);
        const right = start.x + start.width, bottom = start.y + start.height;
        const left = mode.includes('w') ? Math.max(inset, Math.min(start.x + dx, right - minW)) : start.x;
        const top = mode.includes('n') ? Math.max(inset, Math.min(start.y + dy, bottom - minH)) : start.y;
        const endX = mode.includes('e') ? Math.min(window.innerWidth - inset, Math.max(start.x + minW, right + dx)) : right;
        const endY = mode.includes('s') ? Math.min(window.innerHeight - inset, Math.max(start.y + minH, bottom + dy)) : bottom;
        next = { x: left, y: top, width: endX - left, height: endY - top };
      }
      paint(host, next, latest.current.collapsed);
    }
    function cleanup() {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', abort); window.removeEventListener('blur', abort);
      target.removeEventListener('lostpointercapture', abort);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      delete host.dataset.gesturing;
      document.documentElement.style.userSelect = previousSelect;
      cancel.current = null;
    }
    function finish(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      cleanup(); latest.current.persist({ windowBounds: next });
    }
    function abort() { cleanup(); paint(host, start, latest.current.collapsed); }
    cancel.current = abort;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', abort); window.addEventListener('blur', abort);
    target.addEventListener('lostpointercapture', abort);
  }
  return { wide, startGesture };
}
export function ResizeHandles({ startGesture }: { startGesture: (event: ReactPointerEvent, mode: Gesture) => void }) {
  return <>{(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const).map(mode =>
    <div key={mode} className={`nova-resize nova-resize-${mode}`} data-resize={mode} aria-hidden="true"
      title="拖动调整窗口大小" onPointerDown={event => startGesture(event, mode)} />)}</>;
}
