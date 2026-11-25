/**
 * Известия за изтичащи документи (винетка, ГО, ТП, каско).
 *
 * Плъгинът е фиксиран на точна версия в package.json, защото cancelAndroidAlarm()
 * разчита на вътрешния му клас NotificationAlarmReceiver – при обновяване да се провери отново.
 */
import { ApplicationSettings, isAndroid, Utils } from '@nativescript/core'
import { LocalNotifications, ScheduleOptions } from '@nativescript/local-notifications'
import { formatDate } from './format'
import { documentStatus, toIsoDate } from './logic'
import { categoryLabel } from './model'
import { getCars, getExpensesByCar } from './store'
import { L } from '../strings'

/** Колко дни преди изтичане да има напомняне (0 = в деня на изтичане). */
export const REMIND_DAYS_BEFORE = [30, 7, 1, 0]
/** Час на известието (местно време). */
const REMIND_HOUR = 10
/** Id на напомнянията за документи: FIRST_ID, FIRST_ID + 1, … */
const FIRST_ID = 1000
/** Id на тестовото известие (извън диапазона на напомнянията, за да не се трие при пренареждане). */
const TEST_ID = 999
/** До колко id назад да се чистят „осиротели“ будилници, ако не знаем последното. */
const DEFAULT_ID_RANGE = 200
const LAST_ID_KEY = 'mycar.notify.lastId'
/** Изчакване след последната промяна, преди известията да се пренаредят. */
const RESCHEDULE_DELAY_MS = 1000

/** Всички бъдещи напомняния за документи. */
export function buildReminders(now = new Date()): ScheduleOptions[] {
  const today = toIsoDate(now)
  const expensesByCar = getExpensesByCar()
  const res: ScheduleOptions[] = []
  let id = FIRST_ID
  for (const car of getCars()) {
    const carName = car.plate ? `${car.name} (${car.plate})` : car.name
    for (const doc of documentStatus(expensesByCar.get(car.id) ?? [], today)) {
      if (!doc.validUntil) {
        continue
      }

      for (const days of REMIND_DAYS_BEFORE) {
        const at = new Date(doc.validUntil + 'T00:00:00')
        at.setDate(at.getDate() - days)
        at.setHours(REMIND_HOUR, 0, 0, 0)
        if (at.getTime() <= now.getTime()) {
          continue
        }

        res.push({
          id: id++,
          title: L.notify.title(categoryLabel(doc.category), L.notify.expires(days)),
          body: L.notify.body(carName, formatDate(doc.validUntil)),
          at,
          channel: L.notify.channel,
          forceShowWhenInForeground: true,
        })
      }
    }
  }
  return res
}

/**
 * Спира будилника на известие в Android.
 * Плъгинът създава PendingIntent с FLAG_IMMUTABLE, а неговият cancel() търси
 * FLAG_MUTABLE и на Android 12+ не го намира – затова го спираме сами.
 */
function cancelAndroidAlarm(id: number) {
  if (!isAndroid) {
    return
  }

  const context = Utils.android.getApplicationContext()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- класът на плъгина няма типове
  const receiver = (com as any).telerik.localnotifications.NotificationAlarmReceiver.class
  const intent = new android.content.Intent(context, receiver).setAction('' + id)
  const flags = android.app.PendingIntent.FLAG_NO_CREATE | android.app.PendingIntent.FLAG_IMMUTABLE
  const pi = android.app.PendingIntent.getBroadcast(context, 0, intent, flags)
  if (pi) {
    const alarmManager = context.getSystemService(android.content.Context.ALARM_SERVICE) as android.app.AlarmManager
    alarmManager.cancel(pi)
    pi.cancel()
  }
}

let running: Promise<void> = Promise.resolve()

/**
 * Изтрива всички планирани напомняния и ги планира наново от текущите данни.
 * Извикванията се нареждат едно след друго, за да не се застъпват.
 */
export function rescheduleNotifications(): Promise<void> {
  running = running.then(async () => {
    try {
      // Минаваме през всички id до последното планирано, за да хванем и „осиротели“ будилници.
      const known = (await LocalNotifications.getScheduledIds()).filter((id) => id >= FIRST_ID)
      const lastId = Math.max(ApplicationSettings.getNumber(LAST_ID_KEY, FIRST_ID + DEFAULT_ID_RANGE), ...known)
      for (let id = FIRST_ID; id <= lastId; id++) {
        cancelAndroidAlarm(id)
        if (known.includes(id)) {
          await LocalNotifications.cancel(id)
        }
      }
      const reminders = buildReminders()
      ApplicationSettings.setNumber(LAST_ID_KEY, FIRST_ID + Math.max(0, reminders.length - 1))
      // schedule() сам пита за разрешение (Android 13+) при първото извикване
      if (reminders.length) {
        await LocalNotifications.schedule(reminders)
      }
    } catch (e) {
      console.error('rescheduleNotifications', e)
    }
  })
  return running
}

let pending: ReturnType<typeof setTimeout> | undefined

/** Пренарежда известията малко след последната промяна (няколко записа подред = едно пренареждане). */
export function requestReschedule(): void {
  if (pending) {
    clearTimeout(pending)
  }

  pending = setTimeout(() => {
    pending = undefined
    void rescheduleNotifications()
  }, RESCHEDULE_DELAY_MS)
}

/** Тестово известие след 5 секунди – за проверка, че известията работят. */
export async function testNotification(): Promise<boolean> {
  const granted = (await LocalNotifications.hasPermission()) || (await LocalNotifications.requestPermission())
  if (!granted) {
    return false
  }

  await LocalNotifications.schedule([
    {
      id: TEST_ID,
      title: L.notify.testTitle,
      body: L.notify.testBody,
      at: new Date(Date.now() + 5000),
      channel: L.notify.channel,
      forceShowWhenInForeground: true,
    },
  ])
  return true
}

/** Брой планирани напомняния за документи (без тестовото). */
export async function scheduledCount(): Promise<number> {
  return (await LocalNotifications.getScheduledIds()).filter((id) => id >= FIRST_ID).length
}
