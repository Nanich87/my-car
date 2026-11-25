import { Dialogs, EventData, Frame, NavigatedData, Observable, Page } from '@nativescript/core'
import {
  byCategory,
  deleteCar,
  deleteExpense,
  documentStatus,
  formatDate,
  fuelConsumption,
  getCar,
  getExpenses,
  money,
  serviceItemName,
  serviceStatus,
  sum,
} from '../data/store'
import { editCarDialog } from './car-dialog'
import { L } from '../strings'

let vm: Observable
let carId: string

function shortDays(n: number): string {
  if (n < 0) return L.car.docExpired
  if (n === 0) return L.car.docToday
  return L.units.days(n)
}

function refresh() {
  const car = getCar(carId)
  if (!car) return
  const exps = getExpenses(carId)
  const year = new Date().getFullYear()
  const thisYear = exps.filter((e) => e.date.startsWith(year + '-'))
  const cons = fuelConsumption(exps)

  vm.set('car', car)
  const st = serviceStatus(carId)
  const overdue = st.filter((x) => x.state === 'overdue').length
  const soon = st.filter((x) => x.state === 'soon').length
  vm.set('serviceButtonText', overdue ? L.car.serviceOverdue(overdue) : soon ? L.car.serviceSoon(soon) : L.car.service)
  vm.set(
    'docs',
    documentStatus(carId).map((d) => ({
      name: L.categoryShort[d.category] || d.category,
      state: d.state,
      text: d.validUntil ? L.car.docUntil(formatDate(d.validUntil), shortDays(d.daysLeft!)) : L.car.noRecord,
      // натискане = подновяване (нов разход с тази категория)
      open: () =>
        Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId, category: d.category } }),
    }))
  )
  vm.set('totalText', money(sum(exps)))
  vm.set('yearLabel', L.car.inYear(year))
  vm.set('yearText', money(sum(thisYear)))
  vm.set('consumptionText', cons == null ? L.common.dash : L.car.fuelValue(cons.toFixed(1)))
  vm.set(
    'categories',
    byCategory(exps).map((c) => ({ category: c.category, totalText: money(c.total) }))
  )
  vm.set(
    'expenses',
    exps.map((e) => {
      const parts = [formatDate(e.date)]
      if (e.odometer) parts.push(L.units.kmShort(e.odometer))
      if (e.liters) parts.push(L.units.liters(e.liters))
      if (e.validUntil) parts.push(L.car.validUntil(formatDate(e.validUntil)))
      if (e.parts?.length) parts.push(e.parts.map(serviceItemName).join(', '))
      if (e.note) parts.push(e.note)
      const item = { ...e, amountText: money(e.amount), details: parts.join(' · '), open: () => expenseTap(item) }
      return item
    })
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

export function addExpense() {
  Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId } })
}

async function expenseTap(exp: { id: string; category: string; amountText: string }) {
  const choice = await Dialogs.action({
    title: L.car.expenseTitle(exp.category, exp.amountText),
    cancelButtonText: L.common.cancel,
    actions: [L.common.edit, L.common.delete],
  })
  if (choice === L.common.edit) {
    Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId, expenseId: exp.id } })
  } else if (choice === L.common.delete) {
    const ok = await Dialogs.confirm({
      title: L.common.deleting,
      message: L.car.deleteExpenseConfirm,
      okButtonText: L.common.delete,
      cancelButtonText: L.common.cancel,
    })
    if (ok) {
      deleteExpense(exp.id)
      refresh()
    }
  }
}

export async function carOptions(args: EventData) {
  const car = getCar(carId)
  const choice = await Dialogs.action({
    title: car.name,
    cancelButtonText: L.common.cancel,
    actions: [L.car.editCar, L.car.deleteCar],
  })
  if (choice === L.car.editCar) {
    if (await editCarDialog(car)) refresh()
  } else if (choice === L.car.deleteCar) {
    const ok = await Dialogs.confirm({
      title: L.common.deleting,
      message: L.car.deleteCarConfirm(car.name),
      okButtonText: L.common.delete,
      cancelButtonText: L.common.cancel,
    })
    if (ok) {
      deleteCar(carId)
      Frame.topmost().goBack()
    }
  }
}

export function openService() {
  Frame.topmost().navigate({ moduleName: 'pages/service-page', context: { carId } })
}

export function goBack() {
  Frame.topmost().goBack()
}
