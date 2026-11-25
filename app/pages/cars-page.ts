import { Dialogs, EventData, Frame, ItemEventData, Observable, Page } from '@nativescript/core'
import { daysText, documentStatus, getCars, getExpenses, money, sum } from '../data/store'
import { editCarDialog } from './car-dialog'
import { dbReady } from '../data/db'
import { scheduledCount, testNotification } from '../data/notify'

let vm: Observable

function alerts(carId: string, state: 'expired' | 'soon'): string {
  return documentStatus(carId)
    .filter((d) => d.state === state)
    .map((d) => `${d.category}: ${daysText(d.daysLeft!)}`)
    .join('\n')
}

function refresh() {
  const cars = getCars().map((c) => {
    const exps = getExpenses(c.id)
    return {
      ...c,
      totalText: money(sum(exps)),
      countText: exps.length + (exps.length === 1 ? ' разход' : ' разхода'),
      expiredText: alerts(c.id, 'expired'),
      soonText: alerts(c.id, 'soon'),
    }
  })
  vm.set('cars', cars)
}

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  if (!vm) vm = new Observable()
  page.bindingContext = vm
  // при първото отваряне базата може още да се отваря
  dbReady.then(refresh).catch((e) => {
    console.error('dbReady', e)
    Dialogs.alert({ title: 'Грешка', message: 'Базата данни не може да бъде отворена: ' + e, okButtonText: 'OK' })
  })
}

export async function addCar() {
  if (await editCarDialog()) refresh()
}

export function openCar(args: ItemEventData) {
  const car = vm.get('cars')[args.index]
  Frame.topmost().navigate({ moduleName: 'pages/car-page', context: { carId: car.id } })
}

export async function moreMenu() {
  const count = await scheduledCount()
  const choice = await Dialogs.action({
    title: `Планирани известия: ${count}`,
    cancelButtonText: 'Затвори',
    actions: ['Тестово известие (след 5 сек.)'],
  })
  if (choice === 'Тестово известие (след 5 сек.)') {
    const ok = await testNotification()
    if (!ok)
      await Dialogs.alert({
        title: 'Известията са изключени',
        message: 'Разрешете известията за приложението от настройките на телефона.',
        okButtonText: 'OK',
      })
  }
}
