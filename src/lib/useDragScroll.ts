import { useCallback, useEffect, useRef } from 'react';

/**
 * Enables click-drag (mouse) panning on a horizontally scrollable element,
 * like a mobile touch surface. Attach the returned handlers to the element
 * that owns the overflow. Touch scrolling continues to work natively.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({
    isDown: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    state.current = {
      isDown: true,
      startX: e.pageX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || !state.current.isDown) return;
      const dx = e.pageX - state.current.startX;
      if (Math.abs(dx) > 5) {
        state.current.moved = true;
        el.scrollLeft = state.current.startScrollLeft - dx;
      }
    };
    const onUp = () => {
      state.current.isDown = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return { ref, onMouseDown, dragState: state };
}
