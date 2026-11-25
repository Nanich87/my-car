/**
 * Изчисления без странични ефекти: приемат данните (и „днес“) като параметри,
 * не четат от базата и не зависят от NativeScript – затова се тестват лесно (виж tests/).
 */
import {
  DOC_SOON_DAYS,
  DOCUMENT_PERIODS,
  DocState,
  DocumentStatus,
  Expense,
  Interval,
  OPTIONAL_DOCUMENTS,
  Period,
  SERVICE_ITEMS,
  SERVICE_SOON_KM,
  SERVICE_SOON_MONTHS,
  ServiceState,
  ServiceStatus,
  TRACKED_DOCUMENTS,
} from './model'

// ---------- Дати ----------

export function toIsoDate(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** ISO дата → Date по обяд (така смяната на лятно/зимно време не мести деня). */
export function isoToDate(iso: string): Date {
  return new Date(iso + 'T12:00:00')
}

/** Добавя месеци, без да „прелива“ в следващия месец: 31.01 + 1 месец = 28/29.02. */
export function addMonths(iso: string, months: number): string {
  const d = isoToDate(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return toIsoDate(d)
}

export function addDays(iso: string, days: number): string {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

/** Брой дни от `fromIso` до `toIso` (отрицателно = в миналото). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToDate(toIso).getTime() - isoToDate(fromIso).getTime()) / 86_400_000)
}

/** Последен ден на валидност: начална дата + период − 1 ден. */
export function computeExpiry(startIso: string, period: Period): string {
  let end = startIso
  if (period.months) end = addMonths(end, period.months)
  if (period.days) end = addDays(end, period.days)
  return addDays(end, -1)
}

// ---------- Числа ----------

/**
 * Число от текстово поле: приема десетична запетая и интервали („1 234,50“).
 * Връща `null` за празно поле и `NaN` за невалиден текст.
 */
export function parseDecimal(value: unknown): number | null {
  const s = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (s === '') return null
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

// ---------- Разходи ----------

export function sumCents(expenses: readonly Expense[]): number {
  return expenses.reduce((s, e) => s + e.amountCents, 0)
}

/** Обобщение по категории, сортирано по сума (низходящо). */
export function byCategory(expenses: readonly Expense[]): { category: string; totalCents: number }[] {
  const map = new Map<string, number>()
  for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amountCents)
  return [...map]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

/**
 * Среден разход на гориво (л/100 км), изчислен от заредените литри
 * между първото и последното зареждане с отбелязан километраж.
 */
export function fuelConsumption(expenses: readonly Expense[]): number | null {
  const fills = expenses
    .filter(
      (e): e is Expense & { odometer: number; liters: number } => e.category === 'fuel' && !!e.odometer && !!e.liters,
    )
    .sort((a, b) => a.odometer - b.odometer)
  if (fills.length < 2) return null
  const distance = fills[fills.length - 1].odometer - fills[0].odometer
  if (distance <= 0) return null
  // литрите от първото зареждане не се броят – те са изминати преди периода
  const liters = fills.slice(1).reduce((s, e) => s + e.liters, 0)
  return (liters / distance) * 100
}

/** Последният известен километраж на колата. */
export function currentOdometer(expenses: readonly Expense[]): number | null {
  const kms = expenses.map((e) => e.odometer ?? 0).filter((k) => k > 0)
  return kms.length ? Math.max(...kms) : null
}

// ---------- Документи ----------

/** Последният документ от всеки вид и колко дни остават до изтичането му. */
export function documentStatus(expenses: readonly Expense[], todayIso: string): DocumentStatus[] {
  const docs = expenses.filter((e): e is Expense & { validUntil: string } => !!e.validUntil)
  const categories = [...TRACKED_DOCUMENTS, ...OPTIONAL_DOCUMENTS.filter((c) => docs.some((e) => e.category === c))]
  return categories.map((category) => {
    const last = docs.filter((e) => e.category === category).sort((a, b) => (a.validUntil < b.validUntil ? 1 : -1))[0]
    if (!last) return { category, state: 'none' }
    const daysLeft = daysBetween(todayIso, last.validUntil)
    const state: DocState = daysLeft < 0 ? 'expired' : daysLeft <= DOC_SOON_DAYS ? 'soon' : 'ok'
    return { category, last, validUntil: last.validUntil, daysLeft, state }
  })
}

export function isDocumentCategory(category: string): boolean {
  return category in DOCUMENT_PERIODS
}

// ---------- Обслужване ----------

/** Собствените интервали на колата върху стойностите по подразбиране. */
export function withDefaultIntervals(custom: Readonly<Record<string, Interval>>): Record<string, Interval> {
  const res: Record<string, Interval> = {}
  for (const i of SERVICE_ITEMS) res[i.key] = custom[i.key] ?? { km: i.km, months: i.months }
  return res
}

/** Статус на всяка част: последна смяна и кога е следващата. */
export function serviceStatus(
  expenses: readonly Expense[],
  intervals: Readonly<Record<string, Interval>>,
  todayIso: string,
): ServiceStatus[] {
  const odo = currentOdometer(expenses)
  const soonDate = addMonths(todayIso, SERVICE_SOON_MONTHS)

  return SERVICE_ITEMS.map((item) => {
    const interval = intervals[item.key] ?? { km: item.km, months: item.months }
    // най-новата смяна; при равни дати – по-високият километраж
    const last = expenses
      .filter((e) => e.parts?.includes(item.key))
      .sort((a, b) => (a.date === b.date ? (b.odometer ?? 0) - (a.odometer ?? 0) : a.date < b.date ? 1 : -1))[0]
    if (!last) return { item, interval, state: 'never' }

    const dueKm = interval.km && last.odometer ? last.odometer + interval.km : undefined
    const dueDate = interval.months ? addMonths(last.date, interval.months) : undefined

    let state: ServiceState = dueKm || dueDate ? 'ok' : 'none'
    if ((dueKm && odo && odo >= dueKm) || (dueDate && todayIso >= dueDate)) state = 'overdue'
    else if ((dueKm && odo && dueKm - odo <= SERVICE_SOON_KM) || (dueDate && soonDate >= dueDate)) state = 'soon'

    return { item, interval, last, dueKm, dueDate, state }
  })
}
