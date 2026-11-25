/**
 * Типове и константи на домейна. Без зависимости от NativeScript и базата,
 * за да се ползват и в тестовете.
 */
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
  /** Ключ от L.categories (напр. `fuel`); записи от стари версии може да имат друг текст. */
  category: string
  /** Сумата в центове – без грешки от закръгляне при събиране. */
  amountCents: number
  odometer?: number
  liters?: number
  note?: string
  /** Сменени части/консумативи (ключове от SERVICE_ITEMS) */
  parts?: string[]
  /** До коя дата е валиден документът (винетка, ГО, ТП, каско) – ISO */
  validUntil?: string
}

// ---------- Категории ----------

export type CategoryKey = keyof typeof L.categories

/** Ключовете в реда, в който се показват. */
export const CATEGORY_KEYS = Object.keys(L.categories) as CategoryKey[]

/** Име на категория; непознат ключ (стар запис) се показва както е. */
export function categoryLabel(key: string): string {
  return (L.categories as Record<string, string>)[key] ?? key
}

/** Категории, при които може да се отбележи какво е сменено. */
export const SERVICE_CATEGORIES: readonly string[] = ['service', 'repair', 'tires'] satisfies CategoryKey[]

// ---------- Документи със срок ----------

export interface Period {
  label: string
  months?: number
  days?: number
}

/** Категории със срок на валидност и възможните им периоди (първият е по подразбиране). */
export const DOCUMENT_PERIODS: Readonly<Record<string, readonly Period[]>> = {
  vignette: [
    { label: L.periods.annual, months: 12 },
    { label: L.periods.quarterly, months: 3 },
    { label: L.periods.monthly, months: 1 },
    { label: L.periods.weekly, days: 7 },
    { label: L.periods.weekend, days: 3 },
  ],
  liability: [12, 6, 3, 1].map((m) => ({ label: L.periods.months(m), months: m })),
  inspection: [1, 2, 3].map((y) => ({ label: L.periods.years(y), months: y * 12 })),
  casco: [12, 6].map((m) => ({ label: L.periods.months(m), months: m })),
}

/** Винаги показвани в „Документи“ на колата. */
export const TRACKED_DOCUMENTS: readonly string[] = ['vignette', 'liability', 'inspection'] satisfies CategoryKey[]
/** Показвани само ако има запис. */
export const OPTIONAL_DOCUMENTS: readonly string[] = ['casco'] satisfies CategoryKey[]

/** Документ „изтича скоро“, ако остават толкова дни или по-малко. */
export const DOC_SOON_DAYS = 30

export type DocState = 'none' | 'ok' | 'soon' | 'expired'

export interface DocumentStatus {
  category: string
  last?: Expense
  validUntil?: string
  daysLeft?: number
  state: DocState
}

// ---------- Обслужване ----------

export interface ServiceItem {
  key: string
  name: string
  /** интервал по подразбиране в км (0 = без) */
  km: number
  /** интервал по подразбиране в месеци (0 = без) */
  months: number
}

export const SERVICE_ITEMS: readonly ServiceItem[] = [
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
  return SERVICE_ITEMS.find((i) => i.key === key)?.name ?? key
}

export interface Interval {
  km: number
  months: number
}

/** Обслужване „наближава“ под толкова км… */
export const SERVICE_SOON_KM = 1000
/** …или под толкова месеца. */
export const SERVICE_SOON_MONTHS = 1

export type ServiceState = 'never' | 'ok' | 'soon' | 'overdue' | 'none'

export interface ServiceStatus {
  item: ServiceItem
  interval: Interval
  last?: Expense
  dueKm?: number
  dueDate?: string
  state: ServiceState
}
