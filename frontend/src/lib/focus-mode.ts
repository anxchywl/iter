"use client";

import { useEffect, type RefObject } from "react";
import { morph, reducedMotion } from "@/lib/motion";

const textFields =
  'input:not([type]), input[type="text"], input[type="search"], input[type="number"], textarea';
const phone = "(max-width: 640px)";
type FocusModeOptions = { layout?: "morph" | "css" };

// on phones, a focused text field becomes the only visible field in its scope
export function useFocusMode(
  scope: RefObject<HTMLElement | null>,
  frame?: RefObject<HTMLElement | null>,
  { layout = "morph" }: FocusModeOptions = {},
) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    root.dataset.focusScope = "";
    const media = window.matchMedia(phone);
    let timer = 0;

    function fieldOf(node: EventTarget | null): HTMLElement | null {
      if (!(node instanceof HTMLElement) || !node.matches(textFields))
        return null;
      const field = node.closest<HTMLElement>("[data-field]");
      return field?.closest("[data-focus-scope]") === root ? field : null;
    }

    function activate(field: HTMLElement | null) {
      const current = root!.querySelector<HTMLElement>(
        "[data-field][data-active]",
      );
      const pending = "focusLeaving" in root!.dataset;
      if (current === field && !pending) return;
      window.clearTimeout(timer);
      if (!field && !current) {
        delete root!.dataset.focusLeaving;
        return;
      }
      if (layout === "css") {
        delete root!.dataset.focusLeaving;
        if (current) delete current.dataset.active;
        if (field) {
          root!.dataset.focus = "";
          field.dataset.active = "";
        } else {
          delete root!.dataset.focus;
        }
        return;
      }
      const target = frame?.current ?? root!;
      if (field && !current) {
        root!.dataset.focusLeaving = "";
        timer = window.setTimeout(
          () =>
            morph(target, () => {
              delete root!.dataset.focusLeaving;
              root!.dataset.focus = "";
              field.dataset.active = "";
            }),
          reducedMotion() ? 0 : 130,
        );
        return;
      }
      morph(target, () => {
        delete root!.dataset.focusLeaving;
        if (current) delete current.dataset.active;
        if (field) field.dataset.active = "";
        else delete root!.dataset.focus;
      });
    }

    function onFocusIn(event: FocusEvent) {
      const field = fieldOf(event.target);
      if (field && media.matches) activate(field);
    }

    function onFocusOut(event: FocusEvent) {
      if (fieldOf(event.relatedTarget)) return;
      activate(null);
    }

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, [scope, frame]);
}
