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

let vm: Observable
let carId: string

/** Кратки имена, за да се събират на един ред. */
const DOC_SHORT: Record<string, string> = {
  'Гражданска отговорност': 'ГО',
  'Технически преглед': 'Техн. преглед',
}

function shortDays(n: number): string {
  if (n < 0) return 'изтече!'
  if (n === 0) return 'днес'
  return n === 1 ? '1 ден' : `${n} дни`
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
  vm.set('serviceButtonText', overdue ? `Обслужване (${overdue}!)` : soon ? `Обслужване (${soon})` : 'Обслужване')
  vm.set(
    'docs',
    documentStatus(carId).map((d) => ({
      name: DOC_SHORT[d.category] || d.category,
      state: d.state,
      text: d.validUntil ? `до ${formatDate(d.validUntil)} · ${shortDays(d.daysLeft!)}` : 'няма запис',
      // натискане = подновяване (нов разход с тази категория)
      open: () =>
        Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId, category: d.category } }),
    }))
  )
  vm.set('totalText', money(sum(exps)))
  vm.set('yearLabel', 'През ' + year)
  vm.set('yearText', money(sum(thisYear)))
  vm.set('consumptionText', cons == null ? '—' : cons.toFixed(1) + ' л/100')
  vm.set(
    'categories',
    byCategory(exps).map((c) => ({ category: c.category, totalText: money(c.total) }))
  )
  vm.set(
    'expenses',
    exps.map((e) => {
      const parts = [formatDate(e.date)]
      if (e.odometer) parts.push(e.odometer + ' км')
      if (e.liters) parts.push(e.liters + ' л')
      if (e.validUntil) parts.push('валидна до ' + formatDate(e.validUntil))
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
    title: `${exp.category} – ${exp.amountText}`,
    cancelButtonText: 'Отказ',
    actions: ['Редактирай', 'Изтрий'],
  })
  if (choice === 'Редактирай') {
    Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId, expenseId: exp.id } })
  } else if (choice === 'Изтрий') {
    const ok = await Dialogs.confirm({
      title: 'Изтриване',
      message: 'Сигурни ли сте, че искате да изтриете този разход?',
      okButtonText: 'Изтрий',
      cancelButtonText: 'Отказ',
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
    cancelButtonText: 'Отказ',
    actions: ['Редактирай автомобила', 'Изтрий автомобила'],
  })
  if (choice === 'Редактирай автомобила') {
    if (await editCarDialog(car)) refresh()
  } else if (choice === 'Изтрий автомобила') {
    const ok = await Dialogs.confirm({
      title: 'Изтриване',
      message: `Ще бъдат изтрити „${car.name}“ и всички негови разходи. Продължаване?`,
      okButtonText: 'Изтрий',
      cancelButtonText: 'Отказ',
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
