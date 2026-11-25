import { Dialogs, Frame, ItemEventData, NavigatedData, Observable, Page } from '@nativescript/core'
import { formatDate, formatKm } from '../data/format'
import { currentOdometer, serviceStatus, toIsoDate } from '../data/logic'
import { ServiceState, ServiceStatus } from '../data/model'
import { getCar, getExpenses, getIntervals, saveInterval } from '../data/store'
import { L } from '../strings'

/** Ред на показване: първо просрочените. */
const ORDER: Record<ServiceState, number> = { overdue: 0, soon: 1, ok: 2, none: 3, never: 4 }

function intervalText(s: ServiceStatus): string {
  const p: string[] = []
  if (s.interval.km) {
    p.push(formatKm(s.interval.km))
  }

  if (s.interval.months) {
    p.push(L.units.months(s.interval.months))
  }

  return p.length ? L.service.every(p.join(' / ')) : L.service.noInterval
}

/** „ (остават 2 300 км)“ / „ (просрочено с 1 565 км)“ / „“ без километраж. */
function kmLeftText(left: number | null): string {
  if (left == null) {
    return ''
  }

  if (left >= 0) {
    return L.service.kmLeft(formatKm(left))
  }

  return L.service.kmOverdue(formatKm(-left))
}

function nextText(s: ServiceStatus, odo: number | null): string {
  const p: string[] = []
  if (s.dueKm) {
    const left = odo ? s.dueKm - odo : null
    p.push(L.service.atKm(formatKm(s.dueKm)) + kmLeftText(left))
  }

  if (s.dueDate) {
    p.push(L.service.byDate(formatDate(s.dueDate)))
  }

  if (!p.length) {
    return ''
  }

  const when = p.join(L.service.or)

  return s.state === 'overdue' ? L.service.nextOverdue(when) : L.service.next(when)
}

function describe(s: ServiceStatus, odo: number | null) {
  const lastText = s.last
    ? L.service.changed(formatDate(s.last.date), s.last.odometer ? formatKm(s.last.odometer) : null, intervalText(s))
    : L.service.never(intervalText(s))

  return { name: s.item.name, state: s.state, lastText, nextText: s.last ? nextText(s, odo) : '', status: s }
}

/** Цяло число ≥ 0 от текст; празно = 0; невалидно = null. */
function parseIntOrZero(v: string | undefined): number | null {
  const s = (v ?? '').trim().replace(/\s/g, '')
  if (s === '') {
    return 0
  }

  return /^\d+$/.test(s) ? Number(s) : null
}

class ServiceViewModel extends Observable {
  items: ReturnType<typeof describe>[] = []

  constructor(readonly carId: string) {
    super()
  }

  refresh(): void {
    const car = getCar(this.carId)
    if (!car) {
      return
    }

    const exps = getExpenses(this.carId)
    const odo = currentOdometer(exps)
    this.set('title', L.service.title(car.name))
    this.set('odometerText', odo ? L.service.lastOdometer(formatKm(odo)) : L.service.noOdometer)
    this.set(
      'items',
      serviceStatus(exps, getIntervals(this.carId), toIsoDate(new Date()))
        .sort((a, b) => ORDER[a.state] - ORDER[b.state])
        .map((s) => describe(s, odo)),
    )
  }

  private async editInterval(s: ServiceStatus): Promise<void> {
    const kmRes = await Dialogs.prompt({
      title: s.item.name,
      message: L.service.intervalKm,
      defaultText: s.interval.km ? String(s.interval.km) : '',
      okButtonText: L.common.next,
      cancelButtonText: L.common.cancel,
      inputType: 'number',
    })
    if (!kmRes.result) {
      return
    }

    const mRes = await Dialogs.prompt({
      title: s.item.name,
      message: L.service.intervalMonths,
      defaultText: s.interval.months ? String(s.interval.months) : '',
      okButtonText: L.common.save,
      cancelButtonText: L.common.cancel,
      inputType: 'number',
    })
    if (!mRes.result) {
      return
    }

    const km = parseIntOrZero(kmRes.text)
    const months = parseIntOrZero(mRes.text)
    if (km == null || months == null) {
      await Dialogs.alert({ title: L.common.error, message: L.service.invalidNumber, okButtonText: L.common.ok })

      return
    }

    saveInterval(this.carId, s.item.key, { km, months })
    this.refresh()
  }

  itemTap = async (args: ItemEventData): Promise<void> => {
    const s = this.items[args.index]?.status
    if (!s) {
      return
    }

    const actions = [L.service.markChanged, L.service.editInterval]
    if (s.last) {
      actions.push(L.service.viewLast)
    }

    const choice = await Dialogs.action({ title: s.item.name, cancelButtonText: L.common.cancel, actions })
    if (choice === L.service.markChanged) {
      Frame.topmost().navigate({
        moduleName: 'pages/expense-page',
        context: { carId: this.carId, category: 'service', parts: [s.item.key] },
      })
    } else if (choice === L.service.editInterval) {
      await this.editInterval(s)
    } else if (choice === L.service.viewLast && s.last) {
      Frame.topmost().navigate({
        moduleName: 'pages/expense-page',
        context: { carId: this.carId, expenseId: s.last.id },
      })
    }
  }
}

export function navigatingTo(args: NavigatedData): void {
  const page = args.object as Page
  let vm = page.bindingContext as ServiceViewModel | undefined
  if (!(vm instanceof ServiceViewModel)) {
    vm = new ServiceViewModel(page.navigationContext.carId)
    page.bindingContext = vm
  }

  vm.refresh()
}

export function goBack(): void {
  Frame.topmost().goBack()
}
