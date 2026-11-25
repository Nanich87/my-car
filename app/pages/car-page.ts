import { Dialogs, Frame, NavigatedData, Observable, Page } from '@nativescript/core'
import { formatDate, formatDecimal, formatKm, formatLiters, formatMoney } from '../data/format'
import { byCategory, documentStatus, fuelConsumption, serviceStatus, sumCents, toIsoDate } from '../data/logic'
import { Car, categoryLabel, DocumentStatus, Expense, serviceItemName } from '../data/model'
import { deleteCar, deleteExpense, getCar, getExpenses, getIntervals } from '../data/store'
import { L } from '../strings'
import { editCarDialog } from './car-dialog'

function shortDays(n: number): string {
  if (n < 0) {
    return L.car.docExpired
  }

  if (n === 0) {
    return L.car.docToday
  }

  return L.units.days(n)
}

function serviceButtonText(overdue: number, soon: number): string {
  if (overdue) {
    return L.car.serviceOverdue(overdue)
  }

  if (soon) {
    return L.car.serviceSoon(soon)
  }

  return L.car.service
}

class CarViewModel extends Observable {
  car?: Car

  constructor(readonly carId: string) {
    super()
  }

  refresh(): void {
    const car = getCar(this.carId)
    if (!car) {
      return
    }

    const exps = getExpenses(this.carId) // една заявка – всичко останало се смята от нея
    const today = toIsoDate(new Date())
    const year = today.slice(0, 4)
    const cons = fuelConsumption(exps)
    const services = serviceStatus(exps, getIntervals(this.carId), today)
    const overdue = services.filter((x) => x.state === 'overdue').length
    const soon = services.filter((x) => x.state === 'soon').length

    this.set('car', car)
    this.set('serviceButtonText', serviceButtonText(overdue, soon))
    this.set(
      'docs',
      documentStatus(exps, today).map((d) => this.docRow(d)),
    )
    this.set('totalText', formatMoney(sumCents(exps)))
    this.set('yearLabel', L.car.inYear(Number(year)))
    this.set('yearText', formatMoney(sumCents(exps.filter((e) => e.date.startsWith(`${year}-`)))))
    this.set('consumptionText', cons == null ? L.common.dash : L.car.fuelValue(formatDecimal(cons, 1)))
    this.set(
      'categories',
      byCategory(exps).map((c) => ({ category: categoryLabel(c.category), totalText: formatMoney(c.totalCents) })),
    )
    this.set(
      'expenses',
      exps.map((e) => this.expenseRow(e)),
    )
  }

  private docRow(d: DocumentStatus) {
    return {
      name: L.categoryShort[d.category] ?? categoryLabel(d.category),
      state: d.state,
      text:
        d.validUntil && d.daysLeft != null
          ? L.car.docUntil(formatDate(d.validUntil), shortDays(d.daysLeft))
          : L.car.noRecord,
      // натискане = подновяване (нов разход с тази категория)
      open: () =>
        Frame.topmost().navigate({
          moduleName: 'pages/expense-page',
          context: { carId: this.carId, category: d.category },
        }),
    }
  }

  private expenseRow(e: Expense) {
    const details = [formatDate(e.date)]
    if (e.odometer) {
      details.push(formatKm(e.odometer))
    }

    if (e.liters) {
      details.push(formatLiters(e.liters))
    }

    if (e.validUntil) {
      details.push(L.car.validUntil(formatDate(e.validUntil)))
    }

    if (e.parts?.length) {
      details.push(e.parts.map(serviceItemName).join(', '))
    }

    if (e.note) {
      details.push(e.note)
    }

    const amountText = formatMoney(e.amountCents)
    const categoryText = categoryLabel(e.category)

    return {
      categoryText,
      amountText,
      details: details.join(' · '),
      open: () => this.expenseMenu(e, categoryText, amountText),
    }
  }

  private async expenseMenu(e: Expense, categoryText: string, amountText: string): Promise<void> {
    const choice = await Dialogs.action({
      title: L.car.expenseTitle(categoryText, amountText),
      cancelButtonText: L.common.cancel,
      actions: [L.common.edit, L.common.delete],
    })
    if (choice === L.common.edit) {
      Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId: this.carId, expenseId: e.id } })
    } else if (choice === L.common.delete) {
      const ok = await Dialogs.confirm({
        title: L.common.deleting,
        message: L.car.deleteExpenseConfirm,
        okButtonText: L.common.delete,
        cancelButtonText: L.common.cancel,
      })
      if (ok) {
        deleteExpense(e.id)
        this.refresh()
      }
    }
  }

  addExpense = (): void => {
    Frame.topmost().navigate({ moduleName: 'pages/expense-page', context: { carId: this.carId } })
  }

  openService = (): void => {
    Frame.topmost().navigate({ moduleName: 'pages/service-page', context: { carId: this.carId } })
  }

  carOptions = async (): Promise<void> => {
    const car = getCar(this.carId)
    if (!car) {
      return
    }

    const choice = await Dialogs.action({
      title: car.name,
      cancelButtonText: L.common.cancel,
      actions: [L.car.editCar, L.car.deleteCar],
    })
    if (choice === L.car.editCar) {
      if (await editCarDialog(car)) {
        this.refresh()
      }
    } else if (choice === L.car.deleteCar) {
      const ok = await Dialogs.confirm({
        title: L.common.deleting,
        message: L.car.deleteCarConfirm(car.name),
        okButtonText: L.common.delete,
        cancelButtonText: L.common.cancel,
      })
      if (ok) {
        deleteCar(this.carId)
        Frame.topmost().goBack()
      }
    }
  }
}

export function navigatingTo(args: NavigatedData): void {
  const page = args.object as Page
  let vm = page.bindingContext as CarViewModel | undefined
  // при връщане назад страницата пази своя модел; нов модел само при първо отваряне
  if (!(vm instanceof CarViewModel)) {
    vm = new CarViewModel(page.navigationContext.carId)
    page.bindingContext = vm
  }

  vm.refresh()
}

export function goBack(): void {
  Frame.topmost().goBack()
}
