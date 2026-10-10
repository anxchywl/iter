"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useFocusMode } from "@/lib/focus-mode";
import { reducedMotion } from "@/lib/motion";

export type SheetControl = {
  ref: RefObject<HTMLDialogElement | null>;
  open: () => void;
  close: () => void;
};

export function useSheet(): SheetControl {
  const ref = useRef<HTMLDialogElement>(null);
  const open = useCallback(() => {
    const node = ref.current;
    if (!node || node.open) return;
    node.showModal();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        node.dataset.visible = "";
      }),
    );
  }, []);
  const close = useCallback(() => {
    const node = ref.current;
    if (!node?.open || "closing" in node.dataset) return;
    node.dataset.closing = "";
    delete node.dataset.visible;
    window.setTimeout(() => node.close(), reducedMotion() ? 0 : 340);
  }, []);
  return { ref, open, close };
}

export function Sheet({
  sheet,
  title,
  titleId,
  className = "",
  onEscape,
  onClosed,
  onRequestClose,
  children,
}: {
  sheet: SheetControl;
  title: string;
  titleId: string;
  className?: string;
  onEscape?: () => boolean;
  onClosed?: () => void;
  onRequestClose?: () => boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // a false return keeps the sheet open, so a form can ask before discarding edits
  const requestClose = () => {
    if (onRequestClose && !onRequestClose()) return;
    sheet.close();
  };
  useFocusMode(sheet.ref, sheet.ref);

  useEffect(() => {
    // the sheet opens on its title so a phone keyboard stays closed
    heading.current?.setAttribute("autofocus", "");
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const node = sheet.ref.current;
    if (!viewport || !node) return;
    const update = () =>
      node.style.setProperty(
        "--keyboard",
        `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`,
      );
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [sheet.ref]);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    const node = sheet.ref.current;
    if (
      !node ||
      event.button !== 0 ||
      window.matchMedia("(min-width: 700px)").matches ||
      (event.target instanceof Element &&
        event.target.closest("button, a, input, textarea, select"))
    )
      return;
    const handle = event.currentTarget;
    const startY = event.clientY;
    const startTime = performance.now();
    let distance = 0;
    handle.setPointerCapture(event.pointerId);
    node.dataset.dragging = "";
    const move = (moveEvent: PointerEvent) => {
      distance = Math.max(0, moveEvent.clientY - startY);
      node.style.transform = `translateY(${distance}px)`;
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      delete node.dataset.dragging;
      node.style.removeProperty("transform");
      const speed = distance / Math.max(1, performance.now() - startTime);
      if (distance > 90 || (distance > 24 && speed > 0.6)) requestClose();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  return (
    <dialog
      className={`sheet ${className}`.trim()}
      ref={sheet.ref}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === sheet.ref.current) requestClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!onEscape?.()) requestClose();
      }}
      onClose={() => {
        const node = sheet.ref.current;
        if (!node) return;
        delete node.dataset.closing;
        delete node.dataset.visible;
        onClosed?.();
      }}
    >
      <div className="sheet-grab" onPointerDown={startDrag}>
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId} tabIndex={-1} ref={heading} data-focus-hide data-morph>
          {title}
        </h2>
        <button
          type="button"
          className="sheet-close"
          aria-label="Close"
          onClick={requestClose}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {children}
    </dialog>
  );
}
