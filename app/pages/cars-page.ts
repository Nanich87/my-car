import { Dialogs, Frame, ItemEventData, NavigatedData, Observable, Page } from '@nativescript/core'
import { dbReady } from '../data/db'
import { daysText, formatMoney } from '../data/format'
import { documentStatus, sumCents, toIsoDate } from '../data/logic'
import { Car, categoryLabel, DocState } from '../data/model'
import { scheduledCount, testNotification } from '../data/notify'
import { getCars, getExpensesByCar } from '../data/store'
import { L } from '../strings'
import { editCarDialog } from './car-dialog'

interface CarRow extends Car {
  totalText: string
  countText: string
  expiredText: string
  soonText: string
}

class CarsViewModel extends Observable {
  cars: CarRow[] = []

  refresh(): void {
    const today = toIsoDate(new Date())
    const expensesByCar = getExpensesByCar()
    const rows = getCars().map((car): CarRow => {
      const exps = expensesByCar.get(car.id) ?? []
      const docs = documentStatus(exps, today)
      const alerts = (state: DocState) =>
        docs
          .filter((d) => d.state === state && d.daysLeft != null)
          .map((d) => L.cars.alert(categoryLabel(d.category), daysText(d.daysLeft as number)))
          .join('\n')

      return {
        ...car,
        totalText: formatMoney(sumCents(exps)),
        countText: L.cars.expenseCount(exps.length),
        expiredText: alerts('expired'),
        soonText: alerts('soon'),
      }
    })
    this.set('cars', rows)
  }

  addCar = async (): Promise<void> => {
    if (await editCarDialog()) {
      this.refresh()
    }
  }

  openCar = (args: ItemEventData): void => {
    const car = this.cars[args.index]
    if (car) {
      Frame.topmost().navigate({ moduleName: 'pages/car-page', context: { carId: car.id } })
    }
  }

  moreMenu = async (): Promise<void> => {
    const count = await scheduledCount()
    const choice = await Dialogs.action({
      title: L.cars.scheduledNotifications(count),
      cancelButtonText: L.common.close,
      actions: [L.cars.testNotification],
    })
    if (choice === L.cars.testNotification && !(await testNotification())) {
      await Dialogs.alert({
        title: L.cars.notificationsOffTitle,
        message: L.cars.notificationsOffMessage,
        okButtonText: L.common.ok,
      })
    }
  }
}

export function navigatingTo(args: NavigatedData): void {
  const page = args.object as Page
  let vm = page.bindingContext as CarsViewModel | undefined
  if (!(vm instanceof CarsViewModel)) {
    vm = new CarsViewModel()
    page.bindingContext = vm
  }

  const model = vm
  // при първото отваряне базата може още да се отваря
  dbReady
    .then(() => model.refresh())
    .catch((e: unknown) => {
      console.error('dbReady', e)
      void Dialogs.alert({ title: L.common.error, message: L.cars.dbError(e), okButtonText: L.common.ok })
    })
}
