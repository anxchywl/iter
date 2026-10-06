export const sheetEase = "cubic-bezier(0.32, 0.72, 0, 1)";
const duration = 320;

export function reducedMotion(): boolean {
  return (
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// animates a frame between two layouts: height eases, moved [data-morph] items glide, new ones fade in
export function morph(frame: HTMLElement | null, mutate: () => void) {
  if (!frame || reducedMotion()) {
    mutate();
    return;
  }
  const before = frame.getBoundingClientRect().height;
  const items = Array.from(frame.querySelectorAll<HTMLElement>("[data-morph]"));
  const rects = new Map(
    items.map((item) => [item, item.getBoundingClientRect()]),
  );
  frame.getAnimations().forEach((animation) => animation.cancel());
  mutate();
  const after = frame.getBoundingClientRect().height;
  const options = { duration, easing: sheetEase };
  if (Math.abs(after - before) > 1) {
    frame.style.overflow = "hidden";
    frame
      .animate([{ height: `${before}px` }, { height: `${after}px` }], options)
      .finished.catch(() => undefined)
      .finally(() => frame.style.removeProperty("overflow"));
  }
  for (const item of frame.querySelectorAll<HTMLElement>("[data-morph]")) {
    const now = item.getBoundingClientRect();
    if (!now.width && !now.height) continue;
    const old = rects.get(item);
    if (old && (old.width || old.height)) {
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
        item.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
          options,
        );
    } else {
      item.animate(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { ...options, delay: 70, fill: "backwards" },
      );
    }
  }
}
