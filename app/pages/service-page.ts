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
import { L } from '../strings'

let vm: Observable
let carId: string

const ORDER = { overdue: 0, soon: 1, ok: 2, none: 3, never: 4 }

function intervalText(s: ServiceStatus): string {
  const p: string[] = []
  if (s.interval.km) p.push(formatKm(s.interval.km))
  if (s.interval.months) p.push(L.units.months(s.interval.months))
  return p.length ? L.service.every(p.join(' / ')) : L.service.noInterval
}

function describe(s: ServiceStatus, odo: number | null) {
  let lastText: string
  let nextText = ''
  if (!s.last) {
    lastText = L.service.never(intervalText(s))
  } else {
    lastText = L.service.changed(
      formatDate(s.last.date),
      s.last.odometer ? formatKm(s.last.odometer) : null,
      intervalText(s)
    )
    const p: string[] = []
    if (s.dueKm) {
      const left = odo ? s.dueKm - odo : null
      p.push(
        L.service.atKm(formatKm(s.dueKm)) +
          (left == null ? '' : left >= 0 ? L.service.kmLeft(formatKm(left)) : L.service.kmOverdue(formatKm(-left)))
      )
    }
    if (s.dueDate) p.push(L.service.byDate(formatDate(s.dueDate)))
    const when = p.join(L.service.or)
    if (p.length) nextText = s.state === 'overdue' ? L.service.nextOverdue(when) : L.service.next(when)
  }
  return { key: s.item.key, name: s.item.name, state: s.state, lastText, nextText, status: s }
}

function refresh() {
  const car = getCar(carId)
  if (!car) return
  const odo = currentOdometer(getExpenses(carId))
  vm.set('title', L.service.title(car.name))
  vm.set('odometerText', odo ? L.service.lastOdometer(formatKm(odo)) : L.service.noOdometer)
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
    message: L.service.intervalKm,
    defaultText: s.interval.km ? String(s.interval.km) : '',
    okButtonText: L.common.next,
    cancelButtonText: L.common.cancel,
    inputType: 'number',
  })
  if (!kmRes.result) return
  const km = parseIntOrZero(kmRes.text)
  const mRes = await Dialogs.prompt({
    title: s.item.name,
    message: L.service.intervalMonths,
    defaultText: s.interval.months ? String(s.interval.months) : '',
    okButtonText: L.common.save,
    cancelButtonText: L.common.cancel,
    inputType: 'number',
  })
  if (!mRes.result) return
  const months = parseIntOrZero(mRes.text)
  if (km == null || months == null) {
    await Dialogs.alert({ title: L.common.error, message: L.service.invalidNumber, okButtonText: L.common.ok })
    return
  }
  saveInterval(carId, s.item.key, { km, months })
  refresh()
}

export async function itemTap(args: ItemEventData) {
  const row = vm.get('items')[args.index]
  const s: ServiceStatus = row.status
  const actions = [L.service.markChanged, L.service.editInterval]
  if (s.last) actions.push(L.service.viewLast)
  const choice = await Dialogs.action({ title: s.item.name, cancelButtonText: L.common.cancel, actions })
  if (choice === L.service.markChanged) {
    Frame.topmost().navigate({
      moduleName: 'pages/expense-page',
      context: { carId, category: L.categories.service, parts: [s.item.key] },
    })
  } else if (choice === L.service.editInterval) {
    await editInterval(s)
  } else if (choice === L.service.viewLast) {
    Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId, expenseId: s.last.id } })
  }
}

export function goBack() {
  Frame.topmost().goBack()
}
