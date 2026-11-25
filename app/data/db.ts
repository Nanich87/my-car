/**
 * SQLite база (файл „mycar.db“ в папката с данни на приложението).
 *
 * Схемата се версионира с PRAGMA user_version: всяка промяна е нов елемент в MIGRATIONS.
 * Ползва синхронните методи на @nativescript-community/sqlite (нужен е NativeScript 9.1+),
 * затова преди първата заявка трябва да се изчака `dbReady`.
 */
import { ApplicationSettings } from '@nativescript/core'
import { openOrCreate, SQLiteDatabase, SqliteParams, SqliteRow } from '@nativescript-community/sqlite'

const MIGRATIONS: string[] = [
  // 1: начална схема
  `
  CREATE TABLE cars (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    plate TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE expenses (
    id          TEXT PRIMARY KEY,
    car_id      TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,           -- YYYY-MM-DD
    category    TEXT NOT NULL,
    amount      REAL NOT NULL DEFAULT 0,
    odometer    INTEGER,
    liters      REAL,
    note        TEXT,
    valid_until TEXT                     -- YYYY-MM-DD (винетка, ГО, ТП, каско)
  );
  CREATE INDEX expenses_car_date ON expenses(car_id, date DESC);
  CREATE TABLE expense_parts (
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    part       TEXT NOT NULL,            -- ключ от SERVICE_ITEMS
    PRIMARY KEY (expense_id, part)
  );
  CREATE TABLE service_intervals (
    car_id   TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    km       INTEGER NOT NULL DEFAULT 0,
    months   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (car_id, item_key)
  );
  `,
]

let db: SQLiteDatabase

/** Изпълнява няколко заявки, разделени с „;“ (executeSync приема една). */
function runScript(script: string) {
  for (const stmt of script.split(';').map((s) => s.trim())) {
    if (stmt) db.executeSync(stmt)
  }
}

export function query(sql: string, params?: SqliteParams): SqliteRow[] {
  return db.selectSync(sql, params)
}

export function queryOne(sql: string, params?: SqliteParams): SqliteRow | null {
  return db.getSync(sql, params)
}

export function exec(sql: string, params?: SqliteParams) {
  db.executeSync(sql, params)
}

/** Всичко в fn се записва наведнъж или изобщо не се записва. */
export function transaction<T>(fn: () => T): T {
  db.executeSync('BEGIN IMMEDIATE')
  try {
    const res = fn()
    db.executeSync('COMMIT')
    return res
  } catch (e) {
    db.executeSync('ROLLBACK')
    throw e
  }
}

function migrate() {
  const version = Number(queryOne('PRAGMA user_version')?.user_version || 0)
  for (let v = version; v < MIGRATIONS.length; v++) {
    transaction(() => {
      runScript(MIGRATIONS[v])
      // PRAGMA не приема параметри
      db.executeSync(`PRAGMA user_version = ${v + 1}`)
    })
  }
}

// ---------- Еднократно прехвърляне от ApplicationSettings (до версия със SQLite) ----------

const OLD_CARS_KEY = 'mycar.cars'
const OLD_EXPENSES_KEY = 'mycar.expenses'
const OLD_INTERVALS_KEY = 'mycar.intervals.'

function importFromSettings() {
  if (!ApplicationSettings.hasKey(OLD_CARS_KEY) && !ApplicationSettings.hasKey(OLD_EXPENSES_KEY)) return
  const parse = (key: string, def: string) => {
    try {
      return JSON.parse(ApplicationSettings.getString(key, def))
    } catch {
      return JSON.parse(def)
    }
  }
  const cars: any[] = parse(OLD_CARS_KEY, '[]')
  const expenses: any[] = parse(OLD_EXPENSES_KEY, '[]')
  const carIds = new Set(cars.map((c) => c.id))

  transaction(() => {
    for (const c of cars) {
      exec('INSERT OR IGNORE INTO cars (id, name, plate) VALUES (?, ?, ?)', [c.id, c.name, c.plate || ''])
      const intervals = parse(OLD_INTERVALS_KEY + c.id, '{}')
      for (const key of Object.keys(intervals)) {
        exec('INSERT OR REPLACE INTO service_intervals (car_id, item_key, km, months) VALUES (?, ?, ?, ?)', [
          c.id,
          key,
          intervals[key].km || 0,
          intervals[key].months || 0,
        ])
      }
    }
    for (const e of expenses) {
      if (!carIds.has(e.carId)) continue
      exec(
        `INSERT OR IGNORE INTO expenses (id, car_id, date, category, amount, odometer, liters, note, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.carId, e.date, e.category, e.amount || 0, e.odometer ?? null, e.liters ?? null, e.note ?? null, e.validUntil ?? null]
      )
      for (const p of e.parts || []) exec('INSERT OR IGNORE INTO expense_parts (expense_id, part) VALUES (?, ?)', [e.id, p])
    }
  })

  // старите ключове се махат само след успешно записване
  ApplicationSettings.remove(OLD_CARS_KEY)
  ApplicationSettings.remove(OLD_EXPENSES_KEY)
  for (const c of cars) ApplicationSettings.remove(OLD_INTERVALS_KEY + c.id)
  console.log(`SQLite: прехвърлени ${cars.length} коли и ${expenses.length} разхода`)
}

/** Отваря базата, прилага миграциите и прехвърля старите данни. */
export const dbReady: Promise<void> = (async () => {
  db = openOrCreate('mycar.db')
  await db.ready
  exec('PRAGMA foreign_keys = ON')
  migrate()
  importFromSettings()
})()
