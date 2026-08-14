/**
 * Resolves customizable icon references (a lucide name from the curated
 * {@link iconRegistry}, or an image URL/`img:<key>`) for the {@link Icon}
 * component.
 */
import type { Component } from "vue";
import type { IconRef, IconSpec } from "#shared/types";
import { iconRegistry } from "./iconAllowlist";

const FALLBACK_NAME = "CircleHelp";

export function isImageIcon(
  ref: IconRef | undefined,
): ref is IconSpec & { img: string } {
  return !!ref && typeof ref === "object" && "img" in ref && !!ref.img;
}

/** Resolve a lucide component by name (falls back to CircleHelp, then null). */
export function resolveIcon(ref: IconRef | undefined): Component | null {
  if (!ref) return null;
  const name =
    typeof ref === "string" ? ref : "lucide" in ref ? ref.lucide : undefined;
  if (!name) return null;
  return iconRegistry[name] ?? iconRegistry[FALLBACK_NAME] ?? null;
}
