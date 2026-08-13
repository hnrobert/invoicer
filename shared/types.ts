import type { Component } from 'vue'

/** A lucide icon by name, or an image URL/data-URI. */
export type IconSpec = { lucide: string } | { img: string }
export type IconRef = string | IconSpec

/** A component resolved from an IconRef (lucide name) — used by <Icon>. */
export type IconComponent = Component

export type InvoiceStatus =
  | 'pending' // queued, not yet processed
  | 'processing' // extraction / OCR in progress
  | 'qualified' // title + tax id both match → counts toward total
  | 'review' // partial match, or amount not recognized → needs a human
  | 'unqualified' // neither title nor tax id matches
  | 'error' // extraction failed

export interface InvoicePublic {
  id: number
  sessionId: number
  filename: string
  fileType: 'pdf' | 'image'
  status: InvoiceStatus
  reason: string | null
  extractedTitle: string | null
  extractedTaxId: string | null
  extractedAmount: number | null
  manualAmount: number | null
  amountInTotal: boolean
  error: string | null
}
