/**
 * SQLite база (файл „mycar.db“ в папката с данни на приложението).
 *
 * Схемата се версионира с PRAGMA user_version: всяка промяна е нова функция в MIGRATIONS,
 * изпълнена в транзакция. Ползват се синхронните методи на @nativescript-community/sqlite
 * (нужен е NativeScript 9.1+), затова преди първата заявка трябва да се изчака `dbReady`.
 */
import { ApplicationSettings } from '@nativescript/core'
import { openOrCreate, SQLiteDatabase, SqliteParams, SqliteRow } from '@nativescript-community/sqlite'

let db: SQLiteDatabase

export function query<T = SqliteRow>(sql: string, params?: SqliteParams): T[] {
  return db.selectSync(sql, params) as T[]
}

export function queryOne<T = SqliteRow>(sql: string, params?: SqliteParams): T | null {
  return db.getSync(sql, params) as T | null
}

export function exec(sql: string, params?: SqliteParams): void {
  db.executeSync(sql, params)
}

/** Всичко в fn се записва наведнъж или изобщо не се записва. */
export function transaction<T>(fn: () => T): T {
  exec('BEGIN IMMEDIATE')
  try {
    const res = fn()
    exec('COMMIT')
    return res
  } catch (e) {
    exec('ROLLBACK')
    throw e
  }
}

/**
 * Имената на категориите до версия 2 на схемата, когато в базата се пазеше текстът.
 * Замразени са тук – не идват от strings.ts, защото там текстовете може да се сменят.
 */
const LEGACY_CATEGORY_KEYS: Readonly<Record<string, string>> = {
  Гориво: 'fuel',
  Обслужване: 'service',
  Ремонт: 'repair',
  Гуми: 'tires',
  Винетка: 'vignette',
  'Гражданска отговорност': 'liability',
  'Технически преглед': 'inspection',
  Каско: 'casco',
  Данък: 'tax',
  Паркинг: 'parking',
  Измиване: 'wash',
  Глоба: 'fine',
  Друго: 'other',
}

const MIGRATIONS: (() => void)[] = [
  // 1: начална схема
  () => {
    exec(`CREATE TABLE cars (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL,
      plate TEXT NOT NULL DEFAULT ''
    )`)
    exec(`CREATE TABLE expenses (
      id          TEXT PRIMARY KEY,
      car_id      TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,           -- YYYY-MM-DD
      category    TEXT NOT NULL,
      amount      REAL NOT NULL DEFAULT 0,
      odometer    INTEGER,
      liters      REAL,
      note        TEXT,
      valid_until TEXT                     -- YYYY-MM-DD (винетка, ГО, ТП, каско)
    )`)
    exec('CREATE INDEX expenses_car_date ON expenses(car_id, date DESC)')
    exec(`CREATE TABLE expense_parts (
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      part       TEXT NOT NULL,            -- ключ от SERVICE_ITEMS
      PRIMARY KEY (expense_id, part)
    )`)
    exec(`CREATE TABLE service_intervals (
      car_id   TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
      item_key TEXT NOT NULL,
      km       INTEGER NOT NULL DEFAULT 0,
      months   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (car_id, item_key)
    )`)
  },

  // 2: категория по ключ вместо по текст; сумата в центове (INTEGER) вместо евро (REAL)
  () => {
    for (const [label, key] of Object.entries(LEGACY_CATEGORY_KEYS)) {
      exec('UPDATE expenses SET category = ? WHERE category = ?', [key, label])
    }
    exec('ALTER TABLE expenses ADD COLUMN amount_cents INTEGER NOT NULL DEFAULT 0')
    exec('UPDATE expenses SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER)')
    exec('ALTER TABLE expenses DROP COLUMN amount')
  },
]

function migrate() {
  const version = Number(queryOne<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0)
  for (let v = version; v < MIGRATIONS.length; v++) {
    transaction(() => {
      MIGRATIONS[v]()
      // PRAGMA не приема параметри
      exec(`PRAGMA user_version = ${v + 1}`)
    })
    console.log(`SQLite: схема версия ${v + 1}`)
  }
}

// ---------- Еднократно прехвърляне от ApplicationSettings (версиите преди SQLite) ----------

const OLD_CARS_KEY = 'mycar.cars'
const OLD_EXPENSES_KEY = 'mycar.expenses'
const OLD_INTERVALS_KEY = 'mycar.intervals.'

interface OldCar {
  id: string
  name: string
  plate?: string
}
interface OldExpense {
  id: string
  carId: string
  date: string
  category: string
  amount?: number
  odometer?: number
  liters?: number
  note?: string
  parts?: string[]
  validUntil?: string
}

/** JSON от ApplicationSettings; хвърля грешка, ако е повреден (тогава нищо не се трие). */
function readOld<T>(key: string, fallback: T): T {
  if (!ApplicationSettings.hasKey(key)) {
    return fallback
  }

  return JSON.parse(ApplicationSettings.getString(key)) as T
}

function importFromSettings() {
  if (!ApplicationSettings.hasKey(OLD_CARS_KEY) && !ApplicationSettings.hasKey(OLD_EXPENSES_KEY)) {
    return
  }

  let cars: OldCar[]
  let expenses: OldExpense[]
  let intervals: Record<string, Record<string, { km?: number; months?: number }>>
  try {
    cars = readOld<OldCar[]>(OLD_CARS_KEY, [])
    expenses = readOld<OldExpense[]>(OLD_EXPENSES_KEY, [])
    intervals = Object.fromEntries(cars.map((c) => [c.id, readOld(OLD_INTERVALS_KEY + c.id, {})]))
  } catch (e) {
    // старите данни остават непокътнати – може да се опита отново при следващо стартиране
    console.error('SQLite: старите данни не могат да бъдат прочетени', e)
    return
  }

  const carIds = new Set(cars.map((c) => c.id))
  let imported = 0
  transaction(() => {
    for (const c of cars) {
      exec('INSERT OR IGNORE INTO cars (id, name, plate) VALUES (?, ?, ?)', [c.id, c.name, c.plate ?? ''])
      for (const [key, iv] of Object.entries(intervals[c.id])) {
        exec('INSERT OR REPLACE INTO service_intervals (car_id, item_key, km, months) VALUES (?, ?, ?, ?)', [
          c.id,
          key,
          iv.km ?? 0,
          iv.months ?? 0,
        ])
      }
    }
    for (const e of expenses) {
      if (!carIds.has(e.carId) || !e.date || !e.category) {
        continue
      }

      exec(
        `INSERT OR IGNORE INTO expenses (id, car_id, date, category, amount_cents, odometer, liters, note, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.carId,
          e.date,
          LEGACY_CATEGORY_KEYS[e.category] ?? e.category,
          Math.round((e.amount ?? 0) * 100),
          e.odometer ?? null,
          e.liters ?? null,
          e.note ?? null,
          e.validUntil ?? null,
        ],
      )
      for (const p of e.parts ?? []) {
        exec('INSERT OR IGNORE INTO expense_parts (expense_id, part) VALUES (?, ?)', [e.id, p])
      }
      imported++
    }
  })

  // старите ключове се махат само след успешно записване
  ApplicationSettings.remove(OLD_CARS_KEY)
  ApplicationSettings.remove(OLD_EXPENSES_KEY)
  for (const c of cars) {
    ApplicationSettings.remove(OLD_INTERVALS_KEY + c.id)
  }
  console.log(`SQLite: прехвърлени ${cars.length} коли и ${imported} разхода`)
}

/** Отваря базата, прилага миграциите и прехвърля старите данни. */
export const dbReady: Promise<void> = (async () => {
  db = openOrCreate('mycar.db')
  await db.ready
  exec('PRAGMA foreign_keys = ON')
  migrate()
  importFromSettings()
})()
