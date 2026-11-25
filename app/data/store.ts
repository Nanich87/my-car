/**
 * Достъп до данните (SQLite, виж db.ts). Изчисленията са в logic.ts, форматирането – в format.ts.
 */
import { exec, query, queryOne, transaction } from './db'
import { withDefaultIntervals } from './logic'
import { Car, Expense, Interval } from './model'

// ---------- Известяване за промени ----------

const changeListeners: (() => void)[] = []

/** Извиква се след всяка промяна на коли/разходи (напр. за преизчисляване на известията). */
export function onDataChanged(cb: () => void): void {
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
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

// ---------- Редове от базата ----------

interface CarRow {
  id: string
  name: string
  plate: string | null
}

interface ExpenseRow {
  id: string
  car_id: string
  date: string
  category: string
  amount_cents: number
  odometer: number | null
  liters: number | null
  note: string | null
  valid_until: string | null
  parts: string | null
}

function rowToCar(r: CarRow): Car {
  return { id: r.id, name: r.name, plate: r.plate ?? '' }
}

function rowToExpense(r: ExpenseRow): Expense {
  const e: Expense = { id: r.id, carId: r.car_id, date: r.date, category: r.category, amountCents: r.amount_cents }
  if (r.odometer != null) {
    e.odometer = r.odometer
  }

  if (r.liters != null) {
    e.liters = r.liters
  }

  if (r.note != null) {
    e.note = r.note
  }

  if (r.valid_until != null) {
    e.validUntil = r.valid_until
  }

  if (r.parts) {
    e.parts = r.parts.split(',')
  }

  return e
}

const EXPENSE_SELECT = `
  SELECT e.*, (SELECT group_concat(part) FROM expense_parts p WHERE p.expense_id = e.id) AS parts
  FROM expenses e`
const EXPENSE_ORDER = 'ORDER BY e.date DESC, e.rowid DESC'

function writeExpense(e: Expense) {
  exec(
    `INSERT INTO expenses (id, car_id, date, category, amount_cents, odometer, liters, note, valid_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET car_id = excluded.car_id, date = excluded.date, category = excluded.category,
       amount_cents = excluded.amount_cents, odometer = excluded.odometer, liters = excluded.liters,
       note = excluded.note, valid_until = excluded.valid_until`,
    [
      e.id,
      e.carId,
      e.date,
      e.category,
      e.amountCents,
      e.odometer ?? null,
      e.liters ?? null,
      e.note ?? null,
      e.validUntil ?? null,
    ],
  )
  exec('DELETE FROM expense_parts WHERE expense_id = ?', [e.id])
  for (const p of e.parts ?? []) {
    exec('INSERT OR IGNORE INTO expense_parts (expense_id, part) VALUES (?, ?)', [e.id, p])
  }
}

// ---------- Автомобили ----------

export function getCars(): Car[] {
  return query<CarRow>('SELECT * FROM cars ORDER BY rowid').map(rowToCar)
}

export function getCar(id: string): Car | undefined {
  const r = queryOne<CarRow>('SELECT * FROM cars WHERE id = ?', [id])
  return r ? rowToCar(r) : undefined
}

export function saveCar(car: { id?: string; name: string; plate?: string }): Car {
  const existing = car.id ? getCar(car.id) : undefined
  const res: Car = existing
    ? { id: existing.id, name: car.name, plate: car.plate ?? existing.plate }
    : { id: newId(), name: car.name, plate: car.plate ?? '' }
  if (existing) {
    exec('UPDATE cars SET name = ?, plate = ? WHERE id = ?', [res.name, res.plate, res.id])
  } else {
    exec('INSERT INTO cars (id, name, plate) VALUES (?, ?, ?)', [res.id, res.name, res.plate])
  }

  changed()
  return res
}

export function deleteCar(id: string): void {
  // ON DELETE CASCADE трие и разходите, частите и интервалите
  exec('DELETE FROM cars WHERE id = ?', [id])
  changed()
}

// ---------- Разходи ----------

export function getExpenses(carId: string): Expense[] {
  return query<ExpenseRow>(`${EXPENSE_SELECT} WHERE e.car_id = ? ${EXPENSE_ORDER}`, [carId]).map(rowToExpense)
}

/** Разходите на всички коли с една заявка (за списъка с колите и известията). */
export function getExpensesByCar(): Map<string, Expense[]> {
  const res = new Map<string, Expense[]>()
  for (const e of query<ExpenseRow>(`${EXPENSE_SELECT} ${EXPENSE_ORDER}`).map(rowToExpense)) {
    const list = res.get(e.carId)
    if (list) {
      list.push(e)
    } else {
      res.set(e.carId, [e])
    }
  }
  return res
}

export function getExpense(id: string): Expense | undefined {
  const r = queryOne<ExpenseRow>(`${EXPENSE_SELECT} WHERE e.id = ?`, [id])
  return r ? rowToExpense(r) : undefined
}

export function saveExpense(exp: Omit<Expense, 'id'> & { id?: string }): Expense {
  const res: Expense = { ...exp, id: exp.id ?? newId() }
  transaction(() => writeExpense(res))
  changed()
  return res
}

export function deleteExpense(id: string): void {
  exec('DELETE FROM expenses WHERE id = ?', [id])
  changed()
}

// ---------- Интервали за обслужване ----------

/** Интервали за конкретна кола (собствените настройки върху стойностите по подразбиране). */
export function getIntervals(carId: string): Record<string, Interval> {
  const custom: Record<string, Interval> = {}
  const rows = query<{ item_key: string; km: number; months: number }>(
    'SELECT item_key, km, months FROM service_intervals WHERE car_id = ?',
    [carId],
  )
  for (const r of rows) {
    custom[r.item_key] = { km: r.km, months: r.months }
  }
  return withDefaultIntervals(custom)
}

export function saveInterval(carId: string, key: string, interval: Interval): void {
  exec(
    `INSERT INTO service_intervals (car_id, item_key, km, months) VALUES (?, ?, ?, ?)
     ON CONFLICT(car_id, item_key) DO UPDATE SET km = excluded.km, months = excluded.months`,
    [carId, key, interval.km, interval.months],
  )
}
