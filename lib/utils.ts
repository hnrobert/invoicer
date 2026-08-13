import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware className combiner used by all shadcn-vue components. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
