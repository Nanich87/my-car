import {
  Application,
  Dialogs,
  EventData,
  Frame,
  isAndroid,
  NavigatedData,
  Observable,
  Page,
  PropertyChangeData,
  TextField,
} from '@nativescript/core'
import { formatAmountInput, formatDate } from '../data/format'
import { computeExpiry, isDocumentCategory, isoToDate, parseDecimal, toCents, toIsoDate } from '../data/logic'
import {
  CATEGORY_KEYS,
  categoryLabel,
  DOCUMENT_PERIODS,
  Expense,
  SERVICE_CATEGORIES,
  SERVICE_ITEMS,
} from '../data/model'
import { getExpense, saveExpense } from '../data/store'
import { L } from '../strings'

interface NavContext {
  carId: string
  expenseId?: string
  /** предварително избрана категория (напр. „Подновяване“ на документ) */
  category?: string
  /** предварително отметнати части (от екрана „Обслужване“) */
  parts?: string[]
}

class PartItem extends Observable {
  checked: boolean

  constructor(
    readonly key: string,
    readonly name: string,
    checked: boolean,
  ) {
    super()
    this.checked = checked
  }

  toggle = (): void => {
    this.set('checked', !this.checked)
  }
}

/** Android: стандартният календар на системата (чете се добре и в тъмен режим). */
function showDateDialog(initial: Date, onPicked: (d: Date) => void): void {
  const activity = Application.android.foregroundActivity ?? Application.android.startActivity
  const listener = new android.app.DatePickerDialog.OnDateSetListener({
    onDateSet(_view: android.widget.DatePicker, year: number, month: number, day: number) {
      onPicked(new Date(year, month, day, 12, 0, 0))
    },
  })
  new android.app.DatePickerDialog(
    activity,
    listener,
    initial.getFullYear(),
    initial.getMonth(),
    initial.getDate(),
  ).show()
}

class ExpenseViewModel extends Observable {
  private readonly carId: string
  private readonly expenseId?: string
  /** Ключовете на категориите в реда на списъка (+ непозната категория от стар запис). */
  private readonly categoryKeys: string[]
  /** Докато е false, промяна на дата/период не презаписва „Валидна до“ (ръчно зададена дата). */
  private autoExpiry = true

  title = ''
  categoryIndex = 0
  periodIndex = 0
  amount = ''
  date = new Date()
  validUntil?: Date
  odometer = ''
  liters = ''
  note = ''
  parts: PartItem[] = []

  constructor(ctx: NavContext) {
    super()
    this.carId = ctx.carId
    this.expenseId = ctx.expenseId
    const existing = ctx.expenseId ? getExpense(ctx.expenseId) : undefined
    const startCategory = existing?.category ?? ctx.category

    this.categoryKeys = [...CATEGORY_KEYS]
    if (startCategory && !this.categoryKeys.includes(startCategory)) this.categoryKeys.push(startCategory)

    this.set('title', existing ? L.expense.editTitle : L.expense.newTitle)
    this.set('categories', this.categoryKeys.map(categoryLabel))
    this.set('categoryIndex', startCategory ? this.categoryKeys.indexOf(startCategory) : 0)
    const checked = existing?.parts ?? ctx.parts ?? []
    this.set(
      'parts',
      SERVICE_ITEMS.map((i) => new PartItem(i.key, i.name, checked.includes(i.key))),
    )
    this.set('amount', existing ? formatAmountInput(existing.amountCents) : '')
    this.set('date', existing ? isoToDate(existing.date) : new Date())
    this.set('odometer', existing?.odometer ? String(existing.odometer) : '')
    this.set('liters', existing?.liters ? String(existing.liters).replace('.', L.units.decimalSeparator) : '')
    this.set('note', existing?.note ?? '')
    this.applyCategory()
    this.initExpiry(existing)
    this.set('dateText', formatDate(toIsoDate(this.date)))

    this.on(Observable.propertyChangeEvent, (args: EventData) => this.onChange(args as PropertyChangeData))
  }

  private get category(): string {
    return this.categoryKeys[this.categoryIndex] ?? this.categoryKeys[0]
  }

  private initExpiry(existing?: Expense) {
    this.set('periodIndex', 0)
    if (existing?.validUntil) {
      // стар запис: пазим записаната дата, докато потребителят не промени дата/период
      this.autoExpiry = false
      const { date, validUntil } = existing
      const periods = DOCUMENT_PERIODS[existing.category] ?? []
      const match = periods.findIndex((p) => computeExpiry(date, p) === validUntil)
      this.set('periodIndex', Math.max(0, match))
      this.set('validUntil', isoToDate(validUntil))
    } else {
      this.autoExpiry = true
      this.recomputeExpiry()
    }
    this.set('validUntilText', this.validUntil ? formatDate(toIsoDate(this.validUntil)) : '')
  }

  private onChange(e: PropertyChangeData) {
    switch (e.propertyName) {
      case 'date':
        this.set('dateText', formatDate(toIsoDate(this.date)))
        this.autoExpiry = true
        this.recomputeExpiry()
        break
      case 'categoryIndex':
        this.applyCategory()
        this.set('periodIndex', 0)
        this.autoExpiry = true
        this.recomputeExpiry()
        break
      case 'periodIndex':
        this.autoExpiry = true
        this.recomputeExpiry()
        break
      case 'validUntil':
        this.set('validUntilText', this.validUntil ? formatDate(toIsoDate(this.validUntil)) : '')
        break
    }
  }

  /** Обновява полетата, зависещи от категорията. */
  private applyCategory() {
    const periods = DOCUMENT_PERIODS[this.category]
    this.set('isFuel', this.category === 'fuel')
    this.set('isService', SERVICE_CATEGORIES.includes(this.category))
    this.set('isDocument', !!periods)
    this.set('periods', periods ? periods.map((p) => p.label) : [])
  }

  /** Преизчислява „Валидна до“ от датата и избрания период. */
  private recomputeExpiry() {
    const periods = DOCUMENT_PERIODS[this.category]
    if (!periods || !this.autoExpiry) return
    const period = periods[this.periodIndex] ?? periods[0]
    this.set('validUntil', isoToDate(computeExpiry(toIsoDate(this.date), period)))
  }

  /**
   * Цифровата клавиатура на Android приема само точка и тихо изпуска запетаята
   * („96,5“ ставаше 965) – разрешаваме и двата десетични знака.
   */
  decimalField = (args: EventData): void => {
    if (!isAndroid) return
    const field = (args.object as TextField).android as android.widget.EditText
    field.setKeyListener(android.text.method.DigitsKeyListener.getInstance('0123456789.,'))
  }

  pickDate = (): void => {
    showDateDialog(this.date, (d) => this.set('date', d))
  }

  pickValidUntil = (): void => {
    showDateDialog(this.validUntil ?? new Date(), (d) => {
      // ръчно избрана дата – не я презаписваме автоматично
      this.autoExpiry = false
      this.set('validUntil', d)
    })
  }

  private error(message: string): Promise<void> {
    return Dialogs.alert({ title: L.common.error, message, okButtonText: L.common.ok })
  }

  save = async (): Promise<void> => {
    const category = this.category
    const parts = SERVICE_CATEGORIES.includes(category) ? this.parts.filter((p) => p.checked).map((p) => p.key) : []

    // сума: задължителна; празна/0 се приема само при обслужване със сменени части (напр. сам)
    const amount = parseDecimal(this.amount)
    if (Number.isNaN(amount) || (amount ?? 0) < 0) return this.error(L.expense.invalidAmount)
    if (!amount && !parts.length) return this.error(L.expense.invalidAmount)

    const odometer = parseDecimal(this.odometer)
    if (Number.isNaN(odometer) || (odometer ?? 0) < 0) return this.error(L.expense.invalidNumber(L.expense.odometer))
    const liters = category === 'fuel' ? parseDecimal(this.liters) : null
    if (Number.isNaN(liters) || (liters ?? 0) < 0) return this.error(L.expense.invalidNumber(L.expense.liters))

    const date = toIsoDate(this.date)
    const validUntil = isDocumentCategory(category) && this.validUntil ? toIsoDate(this.validUntil) : undefined
    if (validUntil && validUntil < date) return this.error(L.expense.validBeforeDate)

    saveExpense({
      id: this.expenseId,
      carId: this.carId,
      category,
      amountCents: toCents(amount ?? 0),
      date,
      odometer: odometer ? Math.round(odometer) : undefined,
      liters: liters || undefined,
      note: this.note.trim() || undefined,
      parts: parts.length ? parts : undefined,
      validUntil,
    })
    Frame.topmost().goBack()
  }
}

export function navigatingTo(args: NavigatedData): void {
  if (args.isBackNavigation) return
  const page = args.object as Page
  page.bindingContext = new ExpenseViewModel(page.navigationContext as NavContext)
}

export function goBack(): void {
  Frame.topmost().goBack()
}
