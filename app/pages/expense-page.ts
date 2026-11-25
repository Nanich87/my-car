import { Application, Dialogs, Frame, NavigatedData, Observable, Page, PropertyChangeData } from '@nativescript/core'
import {
  CATEGORIES,
  DOCUMENT_PERIODS,
  SERVICE_CATEGORIES,
  SERVICE_ITEMS,
  computeExpiry,
  formatDate,
  getExpense,
  saveExpense,
  toIsoDate,
} from '../data/store'

let vm: Observable
let carId: string
let expenseId: string | undefined
/** Категориите за тази форма (+ стара категория от запис, ако вече я няма в списъка). */
let cats: string[]
/** Докато е false, промяна на дата/период не презаписва „Валидна до“ (при отваряне на стар запис). */
let autoExpiry = true

/** Приема и десетична запетая („12,50“). Връща NaN при невалидна стойност. */
function parseNum(v: any): number {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.')
  return s === '' ? NaN : Number(s)
}

function isoToDate(iso: string): Date {
  return new Date(iso + 'T12:00:00')
}

function currentCategory(): string {
  return cats[vm.get('categoryIndex')] || cats[0]
}

/** Обновява полетата, зависещи от категорията. */
function applyCategory() {
  const category = currentCategory()
  vm.set('isFuel', category === 'Гориво')
  vm.set('isService', SERVICE_CATEGORIES.indexOf(category) >= 0)
  const periods = DOCUMENT_PERIODS[category]
  vm.set('isDocument', !!periods)
  vm.set('periods', periods ? periods.map((p) => p.label) : [])
}

/** Преизчислява „Валидна до“ от датата и избрания период. */
function recomputeExpiry() {
  const periods = DOCUMENT_PERIODS[currentCategory()]
  if (!periods || !autoExpiry) return
  const period = periods[vm.get('periodIndex')] || periods[0]
  vm.set('validUntil', isoToDate(computeExpiry(toIsoDate(vm.get('date') || new Date()), period)))
}

export function navigatingTo(args: NavigatedData) {
  if (args.isBackNavigation) return
  const page = <Page>args.object
  const ctx = page.navigationContext
  carId = ctx.carId
  expenseId = ctx.expenseId

  const existing = expenseId ? getExpense(expenseId) : undefined
  const startCategory: string | undefined = existing?.category || ctx.category
  cats = CATEGORIES.slice()
  if (startCategory && cats.indexOf(startCategory) < 0) cats.push(startCategory)
  const catIndex = startCategory ? cats.indexOf(startCategory) : 0

  vm = new Observable()
  vm.set('title', existing ? 'Редакция на разход' : 'Нов разход')
  vm.set('categories', cats)
  vm.set('categoryIndex', catIndex)

  // отметнати части: от записа или подадени при отваряне (напр. от екрана „Обслужване“)
  const checkedParts: string[] = existing?.parts || ctx.parts || []
  vm.set(
    'parts',
    SERVICE_ITEMS.map((i) => {
      const p = new Observable()
      p.set('key', i.key)
      p.set('name', i.name)
      p.set('checked', checkedParts.indexOf(i.key) >= 0)
      p.set('toggle', () => p.set('checked', !p.get('checked')))
      return p
    })
  )
  vm.set('amount', existing ? String(existing.amount) : '')
  vm.set('date', existing ? isoToDate(existing.date) : new Date())
  vm.set('odometer', existing?.odometer ? String(existing.odometer) : '')
  vm.set('liters', existing?.liters ? String(existing.liters) : '')
  vm.set('note', existing?.note || '')

  applyCategory()
  vm.set('periodIndex', 0)
  if (existing?.validUntil) {
    // стар запис: пазим записаната дата, докато потребителят не промени дата/период
    autoExpiry = false
    const periods = DOCUMENT_PERIODS[existing.category] || []
    const match = periods.findIndex((p) => computeExpiry(existing.date, p) === existing.validUntil)
    vm.set('periodIndex', Math.max(0, match))
    vm.set('validUntil', isoToDate(existing.validUntil))
  } else {
    autoExpiry = true
    recomputeExpiry()
  }
  vm.set('dateText', formatDate(toIsoDate(vm.get('date'))))
  vm.set('validUntilText', vm.get('validUntil') ? formatDate(toIsoDate(vm.get('validUntil'))) : '')

  vm.on(Observable.propertyChangeEvent, (e: PropertyChangeData) => {
    switch (e.propertyName) {
      case 'date':
        vm.set('dateText', formatDate(toIsoDate(e.value || new Date())))
        autoExpiry = true
        recomputeExpiry()
        break
      case 'categoryIndex':
        applyCategory()
        vm.set('periodIndex', 0)
        autoExpiry = true
        recomputeExpiry()
        break
      case 'periodIndex':
        autoExpiry = true
        recomputeExpiry()
        break
      case 'validUntil':
        vm.set('validUntilText', e.value ? formatDate(toIsoDate(e.value)) : '')
        break
    }
  })

  page.bindingContext = vm
}

/** Android: стандартният календар на системата (чете се добре и в тъмен режим). */
function showDateDialog(initial: Date, onPicked: (d: Date) => void) {
  const activity = Application.android.foregroundActivity || Application.android.startActivity
  const listener = new android.app.DatePickerDialog.OnDateSetListener({
    onDateSet(_view: android.widget.DatePicker, year: number, month: number, day: number) {
      onPicked(new Date(year, month, day, 12, 0, 0))
    },
  })
  new android.app.DatePickerDialog(activity, listener, initial.getFullYear(), initial.getMonth(), initial.getDate()).show()
}

export function pickDate() {
  showDateDialog(vm.get('date') || new Date(), (d) => vm.set('date', d))
}

export function pickValidUntil() {
  showDateDialog(vm.get('validUntil') || new Date(), (d) => {
    // ръчно избрана дата – не я презаписваме автоматично
    autoExpiry = false
    vm.set('validUntil', d)
  })
}

export async function save() {
  let amount = parseNum(vm.get('amount'))
  // при обслужване сумата може да е празна/0 (напр. сменени сам чистачки)
  const anyPart = vm.get('isService') && vm.get('parts').some((p: Observable) => p.get('checked'))
  if (anyPart && (isNaN(amount) || amount === 0)) amount = 0
  else if (!(amount > 0)) {
    await Dialogs.alert({ title: 'Грешка', message: 'Въведете валидна сума.', okButtonText: 'OK' })
    return
  }
  const odometer = parseNum(vm.get('odometer'))
  const liters = parseNum(vm.get('liters'))
  const category = currentCategory()
  const date = toIsoDate(vm.get('date') || new Date())
  const parts: string[] =
    SERVICE_CATEGORIES.indexOf(category) >= 0
      ? vm.get('parts').filter((p: Observable) => p.get('checked')).map((p: Observable) => p.get('key'))
      : []
  const validUntil = DOCUMENT_PERIODS[category] && vm.get('validUntil') ? toIsoDate(vm.get('validUntil')) : undefined
  if (validUntil && validUntil < date) {
    await Dialogs.alert({
      title: 'Грешка',
      message: '„Валидна до“ не може да е преди датата на плащане.',
      okButtonText: 'OK',
    })
    return
  }

  saveExpense({
    id: expenseId,
    carId,
    category,
    amount: Math.round(amount * 100) / 100,
    date,
    odometer: odometer > 0 ? Math.round(odometer) : undefined,
    liters: category === 'Гориво' && liters > 0 ? liters : undefined,
    note: (vm.get('note') || '').trim() || undefined,
    parts: parts.length ? parts : undefined,
    validUntil,
  })
  Frame.topmost().goBack()
}

export function goBack() {
  Frame.topmost().goBack()
}
