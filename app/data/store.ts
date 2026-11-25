import { ApplicationSettings } from '@nativescript/core'

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

export const CATEGORIES = [
  'Гориво',
  'Обслужване',
  'Ремонт',
  'Гуми',
  'Винетка',
  'Гражданска отговорност',
  'Технически преглед',
  'Каско',
  'Данък',
  'Паркинг',
  'Измиване',
  'Глоба',
  'Друго',
]

export const CURRENCY = '€'

// ---------- Документи със срок ----------

export interface Period {
  label: string
  months?: number
  days?: number
}

/** Категории със срок на валидност и възможните им периоди (първият е по подразбиране). */
export const DOCUMENT_PERIODS: Record<string, Period[]> = {
  Винетка: [
    { label: 'Годишна', months: 12 },
    { label: 'Тримесечна', months: 3 },
    { label: 'Месечна', months: 1 },
    { label: 'Седмична', days: 7 },
    { label: 'Уикенд', days: 3 },
  ],
  'Гражданска отговорност': [
    { label: '12 месеца', months: 12 },
    { label: '6 месеца', months: 6 },
    { label: '3 месеца', months: 3 },
    { label: '1 месец', months: 1 },
  ],
  'Технически преглед': [
    { label: '1 година', months: 12 },
    { label: '2 години', months: 24 },
    { label: '3 години', months: 36 },
  ],
  Каско: [
    { label: '12 месеца', months: 12 },
    { label: '6 месеца', months: 6 },
  ],
}

/** Винаги показвани в „Документи“ на колата (каско – само ако има запис). */
export const TRACKED_DOCUMENTS = ['Винетка', 'Гражданска отговорност', 'Технически преглед']

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
  if (exps.some((e) => e.category === 'Каско')) cats.push('Каско')
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
  if (n === 0) return 'изтича днес'
  if (n < 0) return `изтече преди ${-n} ${-n === 1 ? 'ден' : 'дни'}`
  return `остават ${n} ${n === 1 ? 'ден' : 'дни'}`
}

/** Категории, при които може да се отбележи какво е сменено. */
export const SERVICE_CATEGORIES = ['Обслужване', 'Ремонт', 'Гуми']

export interface ServiceItem {
  key: string
  name: string
  /** интервал по подразбиране в км (0 = без) */
  km: number
  /** интервал по подразбиране в месеци (0 = без) */
  months: number
}

export const SERVICE_ITEMS: ServiceItem[] = [
  { key: 'oil', name: 'Масло двигател', km: 10000, months: 12 },
  { key: 'oilFilter', name: 'Маслен филтър', km: 10000, months: 12 },
  { key: 'airFilter', name: 'Въздушен филтър', km: 20000, months: 24 },
  { key: 'cabinFilter', name: 'Филтър купе', km: 15000, months: 12 },
  { key: 'fuelFilter', name: 'Горивен филтър', km: 40000, months: 48 },
  { key: 'timing', name: 'Ангренаж (ремък/ролки)', km: 90000, months: 60 },
  { key: 'auxBelt', name: 'Пистов ремък', km: 60000, months: 48 },
  { key: 'sparkPlugs', name: 'Свещи', km: 40000, months: 48 },
  { key: 'brakePadsF', name: 'Накладки предни', km: 40000, months: 0 },
  { key: 'brakePadsR', name: 'Накладки задни', km: 60000, months: 0 },
  { key: 'brakeDiscs', name: 'Спирачни дискове', km: 80000, months: 0 },
  { key: 'brakeFluid', name: 'Спирачна течност', km: 0, months: 24 },
  { key: 'coolant', name: 'Антифриз', km: 0, months: 48 },
  { key: 'gearboxOil', name: 'Масло скоростна кутия', km: 60000, months: 0 },
  { key: 'battery', name: 'Акумулатор', km: 0, months: 60 },
  { key: 'wipers', name: 'Чистачки', km: 0, months: 12 },
  { key: 'tiresSummer', name: 'Летни гуми', km: 0, months: 0 },
  { key: 'tiresWinter', name: 'Зимни гуми', km: 0, months: 0 },
  { key: 'acService', name: 'Климатик (зареждане)', km: 0, months: 24 },
]

export function serviceItemName(key: string): string {
  return SERVICE_ITEMS.find((i) => i.key === key)?.name || key
}

const CARS_KEY = 'mycar.cars'
const EXPENSES_KEY = 'mycar.expenses'
const INTERVALS_KEY = 'mycar.intervals.'

function load<T>(key: string): T[] {
  try {
    return JSON.parse(ApplicationSettings.getString(key, '[]')) as T[]
  } catch {
    return []
  }
}

const changeListeners: (() => void)[] = []

/** Извиква се след всяка промяна на коли/разходи (напр. за преизчисляване на известията). */
export function onDataChanged(cb: () => void) {
  changeListeners.push(cb)
}

function save<T>(key: string, items: T[]) {
  ApplicationSettings.setString(key, JSON.stringify(items))
  for (const cb of changeListeners) {
    try {
      cb()
    } catch (e) {
      console.error('onDataChanged', e)
    }
  }
}

/** Добавя наведнъж коли и разходи (за демо данни). */
export function bulkAdd(cars: Car[], expenses: Expense[]) {
  save(CARS_KEY, getCars().concat(cars))
  save(EXPENSES_KEY, load<Expense>(EXPENSES_KEY).concat(expenses))
}

/** Изтрива всички коли и разходи, чието id започва с prefix (+ разходите на тези коли). */
export function deleteByIdPrefix(prefix: string) {
  const cars = getCars()
  const removedCars = cars.filter((c) => c.id.startsWith(prefix)).map((c) => c.id)
  save(CARS_KEY, cars.filter((c) => !c.id.startsWith(prefix)))
  save(
    EXPENSES_KEY,
    load<Expense>(EXPENSES_KEY).filter((e) => !e.id.startsWith(prefix) && removedCars.indexOf(e.carId) < 0)
  )
  for (const id of removedCars) ApplicationSettings.remove(INTERVALS_KEY + id)
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---------- Автомобили ----------

export function getCars(): Car[] {
  return load<Car>(CARS_KEY)
}

export function getCar(id: string): Car | undefined {
  return getCars().find((c) => c.id === id)
}

export function saveCar(car: Partial<Car> & { name: string }): Car {
  const cars = getCars()
  if (car.id) {
    const i = cars.findIndex((c) => c.id === car.id)
    if (i >= 0) {
      cars[i] = { ...cars[i], ...car } as Car
      save(CARS_KEY, cars)
      return cars[i]
    }
  }
  const created: Car = { id: newId(), name: car.name, plate: car.plate || '' }
  cars.push(created)
  save(CARS_KEY, cars)
  return created
}

export function deleteCar(id: string) {
  save(CARS_KEY, getCars().filter((c) => c.id !== id))
  save(EXPENSES_KEY, load<Expense>(EXPENSES_KEY).filter((e) => e.carId !== id))
  ApplicationSettings.remove(INTERVALS_KEY + id)
}

// ---------- Разходи ----------

export function getExpenses(carId: string): Expense[] {
  return load<Expense>(EXPENSES_KEY)
    .filter((e) => e.carId === carId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function getExpense(id: string): Expense | undefined {
  return load<Expense>(EXPENSES_KEY).find((e) => e.id === id)
}

export function saveExpense(exp: Omit<Expense, 'id'> & { id?: string }): Expense {
  const all = load<Expense>(EXPENSES_KEY)
  if (exp.id) {
    const i = all.findIndex((e) => e.id === exp.id)
    if (i >= 0) {
      all[i] = exp as Expense
      save(EXPENSES_KEY, all)
      return all[i]
    }
  }
  const created: Expense = { ...exp, id: newId() }
  all.push(created)
  save(EXPENSES_KEY, all)
  return created
}

export function deleteExpense(id: string) {
  save(EXPENSES_KEY, load<Expense>(EXPENSES_KEY).filter((e) => e.id !== id))
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
    .filter((e) => e.category === 'Гориво' && e.odometer && e.liters)
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
  let custom: Record<string, Interval> = {}
  try {
    custom = JSON.parse(ApplicationSettings.getString(INTERVALS_KEY + carId, '{}'))
  } catch {}
  const res: Record<string, Interval> = {}
  for (const i of SERVICE_ITEMS) res[i.key] = custom[i.key] || { km: i.km, months: i.months }
  return res
}

export function saveInterval(carId: string, key: string, interval: Interval) {
  let custom: Record<string, Interval> = {}
  try {
    custom = JSON.parse(ApplicationSettings.getString(INTERVALS_KEY + carId, '{}'))
  } catch {}
  custom[key] = interval
  ApplicationSettings.setString(INTERVALS_KEY + carId, JSON.stringify(custom))
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
  return String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' км'
}
