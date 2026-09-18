import { config } from '@/lib/config'

/** Prices in the single configured currency (VITE_CURRENCY); an empty cell shows an em dash. */
export function formatMoney(value: number | undefined): string {
  if (value === undefined) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: config.currency }).format(value)
}
