/**
 * Форматиране за показване (български запис: „1 234,56 €“, „12.03.2027“).
 * Ръчно, а не с Intl, защото V8 в NativeScript може да е без пълни локални данни.
 */
import { L } from '../strings'

/** Число с `digits` знака след запетаята и интервал за хилядите. */
export function formatNumber(n: number, digits = 0): string {
  const [int, frac] = Math.abs(n).toFixed(digits).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, L.units.thousandsSeparator)

  return (n < 0 ? '−' : '') + grouped + (frac ? L.units.decimalSeparator + frac : '')
}

/** Число без излишни нули: 41,9 / 42 (за литри и др.). */
export function formatDecimal(n: number, maxDigits = 2): string {
  const s = formatNumber(n, maxDigits)

  return s.includes(L.units.decimalSeparator) ? s.replace(/0+$/, '').replace(/[,.]$/, '') : s
}

export function formatMoney(cents: number): string {
  return L.units.money(formatNumber(cents / 100, 2))
}

/** Сума за редакция в поле („12,50“) – без хиляден разделител. */
export function formatAmountInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', L.units.decimalSeparator)
}

export function formatKm(km: number): string {
  return L.units.km(formatNumber(Math.round(km)))
}

export function formatLiters(l: number): string {
  return L.units.liters(formatDecimal(l))
}

/** ISO (YYYY-MM-DD) → ДД.ММ.ГГГГ */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')

  return `${d}.${m}.${y}`
}

/** „остават 5 дни“ / „изтича днес“ / „изтече преди 3 дни“ */
export function daysText(n: number): string {
  if (n === 0) {
    return L.docs.expiresToday
  }

  if (n < 0) {
    return L.docs.expiredAgo(-n)
  }

  return L.docs.daysLeft(n)
}
