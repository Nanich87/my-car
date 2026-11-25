import { ApplicationSettings, Utils, isAndroid } from '@nativescript/core'
import { LocalNotifications, ScheduleOptions } from '@nativescript/local-notifications'
import { formatDate, getCars, documentStatus } from './store'
import { L } from '../strings'

/** Колко дни преди изтичане да има напомняне (0 = в деня на изтичане). */
export const REMIND_DAYS_BEFORE = [30, 7, 1, 0]
/** Час на известието (местно време). */
const REMIND_HOUR = 10

/** Всички бъдещи напомняния за документи (винетка, ГО, ТП, каско). */
export function buildReminders(): ScheduleOptions[] {
  const now = Date.now()
  const res: ScheduleOptions[] = []
  let id = FIRST_ID
  for (const car of getCars()) {
    const carName = car.plate ? `${car.name} (${car.plate})` : car.name
    for (const doc of documentStatus(car.id)) {
      if (!doc.validUntil) continue
      for (const days of REMIND_DAYS_BEFORE) {
        const at = new Date(doc.validUntil + 'T00:00:00')
        at.setDate(at.getDate() - days)
        at.setHours(REMIND_HOUR, 0, 0, 0)
        if (at.getTime() <= now) continue
        res.push({
          id: id++,
          title: L.notify.title(doc.category, L.notify.expires(days)),
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

const FIRST_ID = 1000
const LAST_ID_KEY = 'mycar.notify.lastId'

/**
 * Спира будилника на известие в Android.
 * Плъгинът създава PendingIntent с FLAG_IMMUTABLE, а неговият cancel() търси
 * FLAG_MUTABLE и на Android 12+ не го намира – затова го спираме сами.
 */
function cancelAndroidAlarm(id: number) {
  if (!isAndroid) return
  const context = Utils.android.getApplicationContext()
  const intent = new android.content.Intent(
    context,
    (com as any).telerik.localnotifications.NotificationAlarmReceiver.class
  ).setAction('' + id)
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
 * Изтрива всички планирани известия и ги планира наново от текущите данни.
 * Извикванията се нареждат едно след друго, за да не се застъпват.
 */
export function rescheduleNotifications(): Promise<void> {
  running = running.then(async () => {
    try {
      // само напомнянията за документи (id >= 1000); тестовото известие (999) остава.
      // Минаваме през всички id до последното планирано, за да хванем и „осиротели“ будилници.
      const known = (await LocalNotifications.getScheduledIds()).filter((id) => id >= FIRST_ID)
      const lastId = Math.max(ApplicationSettings.getNumber(LAST_ID_KEY, FIRST_ID + 200), ...known)
      for (let id = FIRST_ID; id <= lastId; id++) {
        cancelAndroidAlarm(id)
        if (known.indexOf(id) >= 0) await LocalNotifications.cancel(id)
      }
      const reminders = buildReminders()
      ApplicationSettings.setNumber(LAST_ID_KEY, reminders.length ? (reminders[reminders.length - 1].id as number) : FIRST_ID)
      // schedule() сам пита за разрешение (Android 13+) при първото извикване
      if (reminders.length) await LocalNotifications.schedule(reminders)
    } catch (e) {
      console.error('rescheduleNotifications', e)
    }
  })
  return running
}

/** Тестово известие след 5 секунди – за проверка, че известията работят. */
export async function testNotification(): Promise<boolean> {
  const granted = (await LocalNotifications.hasPermission()) || (await LocalNotifications.requestPermission())
  if (!granted) return false
  await LocalNotifications.schedule([
    {
      id: 999,
      title: L.notify.testTitle,
      body: L.notify.testBody,
      at: new Date(Date.now() + 5000),
      channel: L.notify.channel,
      forceShowWhenInForeground: true,
    },
  ])
  return true
}

export async function scheduledCount(): Promise<number> {
  return (await LocalNotifications.getScheduledIds()).filter((id) => id >= 1000).length
}
