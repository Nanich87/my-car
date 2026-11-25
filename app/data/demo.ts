/**
 * ВРЕМЕННО: фиктивни данни за изпробване на приложението.
 * Всички записи имат id, започващо с DEMO_PREFIX, и се трият с clearDemoData(),
 * без да засягат истинските данни.
 */
import { Car, Expense, bulkAdd, deleteByIdPrefix, getCars, toIsoDate } from './store'

export const DEMO_PREFIX = 'demo-'

let seq = 0
const id = () => DEMO_PREFIX + (++seq).toString(36) + Math.random().toString(36).slice(2, 6)

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toIsoDate(d)
}

/** Дата на изтичане = днес + n дни (отрицателно = вече изтекла). */
function inDays(n: number): string {
  return daysAgo(-n)
}

export function hasDemoData(): boolean {
  return getCars().some((c) => c.id.startsWith(DEMO_PREFIX))
}

interface CarPlan {
  car: Car
  startKm: number
  kmPerDay: number
  litersPer100: number
  tank: number
}

/** Зареждания на ~2 седмици за последните 18 месеца, с километраж и литри. */
function fuel(p: CarPlan, out: Expense[]) {
  let lastKm = p.startKm
  for (let day = 540; day >= 3; day -= 12 + Math.floor(Math.random() * 8)) {
    const km = Math.round(p.startKm + (540 - day) * p.kmPerDay)
    const liters = Math.round(((km - lastKm) * p.litersPer100) / 100 * 10) / 10 || p.tank / 2
    lastKm = km
    const price = 1.29 + Math.random() * 0.15
    out.push({
      id: id(),
      carId: p.car.id,
      date: daysAgo(day),
      category: 'Гориво',
      amount: Math.round(liters * price * 100) / 100,
      odometer: km,
      liters,
      note: Math.random() < 0.3 ? 'Shell' : undefined,
    })
  }
}

function kmAt(p: CarPlan, day: number): number {
  return Math.round(p.startKm + (540 - day) * p.kmPerDay)
}

export function seedDemoData() {
  const skoda: CarPlan = {
    car: { id: id(), name: 'Демо: Шкода Октавия', plate: 'СА 1234 ВН' },
    startKm: 148000,
    kmPerDay: 45,
    litersPer100: 6.2,
    tank: 50,
  }
  const yaris: CarPlan = {
    car: { id: id(), name: 'Демо: Тойота Ярис', plate: 'В 5678 КР' },
    startKm: 62000,
    kmPerDay: 22,
    litersPer100: 5.1,
    tank: 42,
  }
  const ex: Expense[] = []
  fuel(skoda, ex)
  fuel(yaris, ex)

  const add = (p: CarPlan, day: number, category: string, amount: number, extra: Partial<Expense> = {}) =>
    ex.push({ id: id(), carId: p.car.id, date: daysAgo(day), category, amount, ...extra })

  // --- Шкода: обслужване (маслото е просрочено ~ с 1000 км → червено), ангренаж скоро
  add(skoda, 400, 'Обслужване', 185, {
    odometer: kmAt(skoda, 400),
    parts: ['oil', 'oilFilter', 'airFilter', 'cabinFilter'],
    note: 'Голямо обслужване',
  })
  add(skoda, 270, 'Обслужване', 95, { odometer: kmAt(skoda, 270), parts: ['oil', 'oilFilter'] })
  add(skoda, 300, 'Ремонт', 620, {
    odometer: kmAt(skoda, 300),
    parts: ['timing', 'auxBelt'],
    note: 'Ангренаж + водна помпа',
  })
  add(skoda, 200, 'Ремонт', 240, { odometer: kmAt(skoda, 200), parts: ['brakePadsF'], note: 'Предни накладки' })
  add(skoda, 380, 'Гуми', 0, { odometer: kmAt(skoda, 380), parts: ['tiresWinter'], note: 'Смяна към зимни – сам' })
  add(skoda, 20, 'Гуми', 30, { odometer: kmAt(skoda, 20), parts: ['tiresWinter'], note: 'Смяна към зимни' })
  add(skoda, 700, 'Ремонт', 150, { parts: ['battery'], note: 'Акумулатор Varta' })
  add(skoda, 500, 'Измиване', 12)
  add(skoda, 90, 'Измиване', 15)
  add(skoda, 160, 'Паркинг', 4.5, { note: 'Синя зона' })
  add(skoda, 45, 'Глоба', 50, { note: 'Превишена скорост' })
  add(skoda, 120, 'Данък', 96)
  // документи: винетка изтича скоро (оранжево), ГО изтекла (червено), ТП наред (зелено)
  add(skoda, 365 - 12, 'Винетка', 51, { validUntil: inDays(11) })
  add(skoda, 368, 'Гражданска отговорност', 310, { validUntil: inDays(-4) })
  add(skoda, 150, 'Технически преглед', 45, { odometer: kmAt(skoda, 150), validUntil: inDays(214) })

  // --- Ярис: всичко основно е наред, ГО изтича след 5 дни
  add(yaris, 330, 'Обслужване', 140, {
    odometer: kmAt(yaris, 330),
    parts: ['oil', 'oilFilter', 'airFilter', 'sparkPlugs'],
  })
  add(yaris, 60, 'Обслужване', 110, { odometer: kmAt(yaris, 60), parts: ['oil', 'oilFilter', 'cabinFilter'] })
  add(yaris, 60, 'Обслужване', 0, { odometer: kmAt(yaris, 60), parts: ['wipers'], note: 'Сменени сам' })
  add(yaris, 400, 'Обслужване', 35, { parts: ['brakeFluid'] })
  add(yaris, 250, 'Измиване', 10)
  add(yaris, 30, 'Паркинг', 3)
  add(yaris, 110, 'Данък', 54)
  add(yaris, 100, 'Винетка', 51, { validUntil: inDays(264) })
  add(yaris, 360, 'Гражданска отговорност', 220, { validUntil: inDays(5) })
  add(yaris, 200, 'Технически преглед', 45, { odometer: kmAt(yaris, 200), validUntil: inDays(530) })
  add(yaris, 340, 'Каско', 480, { validUntil: inDays(25) })

  bulkAdd([skoda.car, yaris.car], ex)
}

export function clearDemoData() {
  deleteByIdPrefix(DEMO_PREFIX)
}
