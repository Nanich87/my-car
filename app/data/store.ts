import { exec, query, queryOne, transaction } from './db'
import { L } from '../strings'

export interface Car {
  id: string
  name: string
  plate: string
}

export interface Expense {
  id: string
  carId: string
  /** ISO дата (YYYY-MM-DD) */
  date: string
  category: string
  amount: number
  odometer?: number
  liters?: number
  note?: string
  /** Сменени части/консумативи (ключове от SERVICE_ITEMS) */
  parts?: string[]
  /** До коя дата е валиден документът (винетка, ГО, ТП, каско) – ISO */
  validUntil?: string
}

const C = L.categories

/** Категориите в реда, в който се показват. */
export const CATEGORIES = Object.values(C)

export const CURRENCY = L.units.currency

// ---------- Документи със срок ----------

export interface Period {
  label: string
  months?: number
  days?: number
}

/** Категории със срок на валидност и възможните им периоди (първият е по подразбиране). */
export const DOCUMENT_PERIODS: Record<string, Period[]> = {
  [C.vignette]: [
    { label: L.periods.annual, months: 12 },
    { label: L.periods.quarterly, months: 3 },
    { label: L.periods.monthly, months: 1 },
    { label: L.periods.weekly, days: 7 },
    { label: L.periods.weekend, days: 3 },
  ],
  [C.liability]: [12, 6, 3, 1].map((m) => ({ label: L.periods.months(m), months: m })),
  [C.inspection]: [1, 2, 3].map((y) => ({ label: L.periods.years(y), months: y * 12 })),
  [C.casco]: [12, 6].map((m) => ({ label: L.periods.months(m), months: m })),
}

/** Винаги показвани в „Документи“ на колата (каско – само ако има запис). */
export const TRACKED_DOCUMENTS = [C.vignette, C.liability, C.inspection]

/** Последен ден на валидност: начална дата + период − 1 ден. */
export function computeExpiry(startIso: string, period: Period): string {
  const d = new Date(startIso + 'T12:00:00')
  if (period.months) {
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + period.months)
    // 31.01 + 1 месец → 28/29.02, а не 03.03
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDay))
  }
  if (period.days) d.setDate(d.getDate() + period.days)
  d.setDate(d.getDate() - 1)
  return toIsoDate(d)
}

/** Брой дни от днес до дадена дата (отрицателно = минала). */
export function daysUntil(iso: string): number {
  const today = new Date(toIsoDate(new Date()) + 'T12:00:00').getTime()
  return Math.round((new Date(iso + 'T12:00:00').getTime() - today) / 86400000)
}

export type DocState = 'none' | 'ok' | 'soon' | 'expired'

export interface DocumentStatus {
  category: string
  last?: Expense
  validUntil?: string
  daysLeft?: number
  state: DocState
}

/** „Скоро“ = остават 30 дни или по-малко. */
export function documentStatus(carId: string): DocumentStatus[] {
  const exps = getExpenses(carId).filter((e) => e.validUntil)
  const cats = TRACKED_DOCUMENTS.slice()
  if (exps.some((e) => e.category === C.casco)) cats.push(C.casco)
  return cats.map((category) => {
    const last = exps
      .filter((e) => e.category === category)
      .sort((a, b) => (a.validUntil! < b.validUntil! ? 1 : -1))[0]
    if (!last) return { category, state: 'none' as DocState }
    const daysLeft = daysUntil(last.validUntil!)
    const state: DocState = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'soon' : 'ok'
    return { category, last, validUntil: last.validUntil, daysLeft, state }
  })
}

export function daysText(n: number): string {
  if (n === 0) return L.docs.expiresToday
  if (n < 0) return L.docs.expiredAgo(-n)
  return L.docs.daysLeft(n)
}

/** Категории, при които може да се отбележи какво е сменено. */
export const SERVICE_CATEGORIES = [C.service, C.repair, C.tires]

export interface ServiceItem {
  key: string
  name: string
  /** интервал по подразбиране в км (0 = без) */
  km: number
  /** интервал по подразбиране в месеци (0 = без) */
  months: number
}

export const SERVICE_ITEMS: ServiceItem[] = [
  { key: 'oil', name: L.parts.oil, km: 10000, months: 12 },
  { key: 'oilFilter', name: L.parts.oilFilter, km: 10000, months: 12 },
  { key: 'airFilter', name: L.parts.airFilter, km: 20000, months: 24 },
  { key: 'cabinFilter', name: L.parts.cabinFilter, km: 15000, months: 12 },
  { key: 'fuelFilter', name: L.parts.fuelFilter, km: 40000, months: 48 },
  { key: 'timing', name: L.parts.timing, km: 90000, months: 60 },
  { key: 'auxBelt', name: L.parts.auxBelt, km: 60000, months: 48 },
  { key: 'sparkPlugs', name: L.parts.sparkPlugs, km: 40000, months: 48 },
  { key: 'brakePadsF', name: L.parts.brakePadsF, km: 40000, months: 0 },
  { key: 'brakePadsR', name: L.parts.brakePadsR, km: 60000, months: 0 },
  { key: 'brakeDiscs', name: L.parts.brakeDiscs, km: 80000, months: 0 },
  { key: 'brakeFluid', name: L.parts.brakeFluid, km: 0, months: 24 },
  { key: 'coolant', name: L.parts.coolant, km: 0, months: 48 },
  { key: 'gearboxOil', name: L.parts.gearboxOil, km: 60000, months: 0 },
  { key: 'battery', name: L.parts.battery, km: 0, months: 60 },
  { key: 'wipers', name: L.parts.wipers, km: 0, months: 12 },
  { key: 'tiresSummer', name: L.parts.tiresSummer, km: 0, months: 0 },
  { key: 'tiresWinter', name: L.parts.tiresWinter, km: 0, months: 0 },
  { key: 'acService', name: L.parts.acService, km: 0, months: 24 },
]

export function serviceItemName(key: string): string {
  return SERVICE_ITEMS.find((i) => i.key === key)?.name || key
}

// ---------- Записване (SQLite, виж db.ts) ----------

const changeListeners: (() => void)[] = []

/** Извиква се след всяка промяна на коли/разходи (напр. за преизчисляване на известията). */
export function onDataChanged(cb: () => void) {
  changeListeners.push(cb)
}

function changed() {
  for (const cb of changeListeners) {
    try {
      cb()
    } catch (e) {
      console.error('onDataChanged', e)
    }
  }
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function rowToCar(r: any): Car {
  return { id: r.id, name: r.name, plate: r.plate || '' }
}

/** Чете разходи по условие и им добавя сменените части. */
function selectExpenses(where: string, params: any[]): Expense[] {
  const rows = query(
    `SELECT e.*, (SELECT group_concat(part) FROM expense_parts p WHERE p.expense_id = e.id) AS parts
     FROM expenses e WHERE ${where} ORDER BY e.date DESC, e.rowid DESC`,
    params
  )
  return rows.map((r: any) => {
    const e: Expense = { id: r.id, carId: r.car_id, date: r.date, category: r.category, amount: r.amount }
    if (r.odometer != null) e.odometer = r.odometer
    if (r.liters != null) e.liters = r.liters
    if (r.note != null) e.note = r.note
    if (r.valid_until != null) e.validUntil = r.valid_until
    if (r.parts) e.parts = String(r.parts).split(',')
    return e
  })
}

function writeExpense(e: Expense) {
  exec(
    `INSERT INTO expenses (id, car_id, date, category, amount, odometer, liters, note, valid_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET car_id = excluded.car_id, date = excluded.date, category = excluded.category,
       amount = excluded.amount, odometer = excluded.odometer, liters = excluded.liters, note = excluded.note,
       valid_until = excluded.valid_until`,
    [e.id, e.carId, e.date, e.category, e.amount, e.odometer ?? null, e.liters ?? null, e.note ?? null, e.validUntil ?? null]
  )
  exec('DELETE FROM expense_parts WHERE expense_id = ?', [e.id])
  for (const p of e.parts || []) exec('INSERT OR IGNORE INTO expense_parts (expense_id, part) VALUES (?, ?)', [e.id, p])
}

// ---------- Автомобили ----------

export function getCars(): Car[] {
  return query('SELECT * FROM cars ORDER BY rowid').map(rowToCar)
}

export function getCar(id: string): Car | undefined {
  const r = queryOne('SELECT * FROM cars WHERE id = ?', [id])
  return r ? rowToCar(r) : undefined
}

export function saveCar(car: Partial<Car> & { name: string }): Car {
  const existing = car.id ? getCar(car.id) : undefined
  const res: Car = existing
    ? { ...existing, ...car, plate: car.plate ?? existing.plate }
    : { id: newId(), name: car.name, plate: car.plate || '' }
  if (existing) exec('UPDATE cars SET name = ?, plate = ? WHERE id = ?', [res.name, res.plate, res.id])
  else exec('INSERT INTO cars (id, name, plate) VALUES (?, ?, ?)', [res.id, res.name, res.plate])
  changed()
  return res
}

export function deleteCar(id: string) {
  // ON DELETE CASCADE трие и разходите, частите и интервалите
  exec('DELETE FROM cars WHERE id = ?', [id])
  changed()
}

// ---------- Разходи ----------

export function getExpenses(carId: string): Expense[] {
  return selectExpenses('e.car_id = ?', [carId])
}

export function getExpense(id: string): Expense | undefined {
  return selectExpenses('e.id = ?', [id])[0]
}

export function saveExpense(exp: Omit<Expense, 'id'> & { id?: string }): Expense {
  const res = { ...exp, id: exp.id || newId() } as Expense
  transaction(() => writeExpense(res))
  changed()
  return res
}

export function deleteExpense(id: string) {
  exec('DELETE FROM expenses WHERE id = ?', [id])
  changed()
}

// ---------- Помощни ----------

export function sum(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + (e.amount || 0), 0)
}

export function money(v: number): string {
  return v.toFixed(2) + ' ' + CURRENCY
}

export function toIsoDate(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Обобщение по категории, сортирано по сума (низходящо). */
export function byCategory(expenses: Expense[]): { category: string; total: number }[] {
  const map: Record<string, number> = {}
  for (const e of expenses) map[e.category] = (map[e.category] || 0) + e.amount
  return Object.keys(map)
    .map((category) => ({ category, total: map[category] }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Среден разход на гориво (л/100 км), изчислен от заредените литри
 * между първото и последното зареждане с отбелязан километраж.
 */
export function fuelConsumption(expenses: Expense[]): number | null {
  const fills = expenses
    .filter((e) => e.category === C.fuel && e.odometer && e.liters)
    .sort((a, b) => a.odometer! - b.odometer!)
  if (fills.length < 2) return null
  const distance = fills[fills.length - 1].odometer! - fills[0].odometer!
  if (distance <= 0) return null
  // литрите от първото зареждане не се броят – те са изминати преди периода
  const liters = fills.slice(1).reduce((s, e) => s + e.liters!, 0)
  return (liters / distance) * 100
}

// ---------- Обслужване ----------

export interface Interval {
  km: number
  months: number
}

/** Интервали за конкретна кола (собствените настройки върху стойностите по подразбиране). */
export function getIntervals(carId: string): Record<string, Interval> {
  const custom: Record<string, Interval> = {}
  for (const r of query('SELECT item_key, km, months FROM service_intervals WHERE car_id = ?', [carId]) as any[]) {
    custom[r.item_key] = { km: r.km, months: r.months }
  }
  const res: Record<string, Interval> = {}
  for (const i of SERVICE_ITEMS) res[i.key] = custom[i.key] || { km: i.km, months: i.months }
  return res
}

export function saveInterval(carId: string, key: string, interval: Interval) {
  exec(
    `INSERT INTO service_intervals (car_id, item_key, km, months) VALUES (?, ?, ?, ?)
     ON CONFLICT(car_id, item_key) DO UPDATE SET km = excluded.km, months = excluded.months`,
    [carId, key, interval.km, interval.months]
  )
}

/** Последният известен километраж на колата. */
export function currentOdometer(expenses: Expense[]): number | null {
  const kms = expenses.map((e) => e.odometer || 0).filter((k) => k > 0)
  return kms.length ? Math.max(...kms) : null
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d
}

export type ServiceState = 'never' | 'ok' | 'soon' | 'overdue' | 'none'

export interface ServiceStatus {
  item: ServiceItem
  interval: Interval
  last?: Expense
  dueKm?: number
  dueDate?: string
  state: ServiceState
}

/**
 * Статус на всяка част: последна смяна и кога е следващата.
 * „Скоро“ = остават под 1000 км или под 1 месец.
 */
export function serviceStatus(carId: string): ServiceStatus[] {
  const exps = getExpenses(carId) // най-новите първи
  const intervals = getIntervals(carId)
  const odo = currentOdometer(exps)
  const today = toIsoDate(new Date())
  const soonDate = toIsoDate(addMonths(today, 1))

  return SERVICE_ITEMS.map((item) => {
    const interval = intervals[item.key]
    // при равни дати – по-високият километраж е по-нов
    const last = exps
      .filter((e) => e.parts && e.parts.indexOf(item.key) >= 0)
      .sort((a, b) => (a.date === b.date ? (b.odometer || 0) - (a.odometer || 0) : a.date < b.date ? 1 : -1))[0]
    if (!last) return { item, interval, state: 'never' as ServiceState }

    const dueKm = interval.km && last.odometer ? last.odometer + interval.km : undefined
    const dueDate = interval.months ? toIsoDate(addMonths(last.date, interval.months)) : undefined

    let state: ServiceState = dueKm || dueDate ? 'ok' : 'none'
    if ((dueKm && odo && odo >= dueKm) || (dueDate && today >= dueDate)) state = 'overdue'
    else if ((dueKm && odo && dueKm - odo <= 1000) || (dueDate && soonDate >= dueDate)) state = 'soon'

    return { item, interval, last, dueKm, dueDate, state }
  })
}

export function formatKm(km: number): string {
  return L.units.km(km)
}
