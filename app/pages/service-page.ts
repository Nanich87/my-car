import { Dialogs, Frame, ItemEventData, NavigatedData, Observable, Page } from '@nativescript/core'
import {
  currentOdometer,
  formatDate,
  formatKm,
  getCar,
  getExpenses,
  saveInterval,
  serviceStatus,
  ServiceStatus,
} from '../data/store'

let vm: Observable
let carId: string

const ORDER = { overdue: 0, soon: 1, ok: 2, none: 3, never: 4 }

function intervalText(s: ServiceStatus): string {
  const p: string[] = []
  if (s.interval.km) p.push(formatKm(s.interval.km))
  if (s.interval.months) p.push(s.interval.months + ' мес.')
  return p.length ? 'на ' + p.join(' / ') : 'без интервал'
}

function describe(s: ServiceStatus, odo: number | null) {
  let lastText: string
  let nextText = ''
  if (!s.last) {
    lastText = 'Няма записана смяна · ' + intervalText(s)
  } else {
    lastText =
      'Сменено: ' +
      formatDate(s.last.date) +
      (s.last.odometer ? ' при ' + formatKm(s.last.odometer) : '') +
      ' · ' +
      intervalText(s)
    const p: string[] = []
    if (s.dueKm) {
      const left = odo ? s.dueKm - odo : null
      p.push(
        'при ' +
          formatKm(s.dueKm) +
          (left == null ? '' : left >= 0 ? ` (остават ${formatKm(left)})` : ` (просрочено с ${formatKm(-left)})`)
      )
    }
    if (s.dueDate) p.push('до ' + formatDate(s.dueDate))
    if (p.length) nextText = (s.state === 'overdue' ? 'Просрочено! Следваща: ' : 'Следваща: ') + p.join(' или ')
  }
  return { key: s.item.key, name: s.item.name, state: s.state, lastText, nextText, status: s }
}

function refresh() {
  const car = getCar(carId)
  if (!car) return
  const odo = currentOdometer(getExpenses(carId))
  vm.set('title', 'Обслужване – ' + car.name)
  vm.set('odometerText', odo ? 'Последен километраж: ' + formatKm(odo) : 'Няма въведен километраж')
  vm.set(
    'items',
    serviceStatus(carId)
      .sort((a, b) => ORDER[a.state] - ORDER[b.state])
      .map((s) => describe(s, odo))
  )
}

export function navigatingTo(args: NavigatedData) {
  const page = <Page>args.object
  if (!args.isBackNavigation) {
    carId = page.navigationContext.carId
    vm = new Observable()
    page.bindingContext = vm
  }
  refresh()
}

function parseIntOrZero(v: string): number | null {
  const s = (v || '').trim().replace(/\s/g, '')
  if (s === '') return 0
  const n = Number(s)
  return isFinite(n) && n >= 0 ? Math.round(n) : null
}

async function editInterval(s: ServiceStatus) {
  const kmRes = await Dialogs.prompt({
    title: s.item.name,
    message: 'Интервал в километри (0 или празно = без)',
    defaultText: s.interval.km ? String(s.interval.km) : '',
    okButtonText: 'Напред',
    cancelButtonText: 'Отказ',
    inputType: 'number',
  })
  if (!kmRes.result) return
  const km = parseIntOrZero(kmRes.text)
  const mRes = await Dialogs.prompt({
    title: s.item.name,
    message: 'Интервал в месеци (0 или празно = без)',
    defaultText: s.interval.months ? String(s.interval.months) : '',
    okButtonText: 'Запази',
    cancelButtonText: 'Отказ',
    inputType: 'number',
  })
  if (!mRes.result) return
  const months = parseIntOrZero(mRes.text)
  if (km == null || months == null) {
    await Dialogs.alert({ title: 'Грешка', message: 'Въведете цяло положително число.', okButtonText: 'OK' })
    return
  }
  saveInterval(carId, s.item.key, { km, months })
  refresh()
}

export async function itemTap(args: ItemEventData) {
  const row = vm.get('items')[args.index]
  const s: ServiceStatus = row.status
  const actions = ['Отбележи смяна', 'Промени интервала']
  if (s.last) actions.push('Виж последната смяна')
  const choice = await Dialogs.action({ title: s.item.name, cancelButtonText: 'Отказ', actions })
  if (choice === 'Отбележи смяна') {
    Frame.topmost().navigate({
      moduleName: 'pages/expense-page',
      context: { carId, category: 'Обслужване', parts: [s.item.key] },
    })
  } else if (choice === 'Промени интервала') {
    await editInterval(s)
  } else if (choice === 'Виж последната смяна') {
    Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId, expenseId: s.last.id } })
  }
}

export function goBack() {
  Frame.topmost().goBack()
}
