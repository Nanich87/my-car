/**
 * Всички текстове, които вижда потребителят.
 *
 * В TypeScript: `import { L } from '../strings'` → `L.car.total`.
 * В XML: `text="{{ t('car.total') }}"` – функцията `t` е регистрирана в app.ts като ресурс на приложението.
 *
 * Числата се форматират в data/format.ts; тук функциите получават вече форматиран текст.
 * В базата се пазят само ключове (напр. категория `fuel`), затова текстовете тук
 * могат да се сменят и превеждат свободно.
 */

const plural = (n: number, one: string, many: string) => (Math.abs(n) === 1 ? one : many)

export const L = {
  appName: 'Моята кола',

  common: {
    ok: 'OK',
    cancel: 'Отказ',
    close: 'Затвори',
    save: 'Запази',
    next: 'Напред',
    back: 'Назад',
    edit: 'Редактирай',
    delete: 'Изтрий',
    deleting: 'Изтриване',
    error: 'Грешка',
    dash: '—',
  },

  units: {
    km: (km: string) => `${km} км`,
    liters: (l: string) => `${l} л`,
    money: (amount: string) => `${amount} €`,
    months: (m: number) => `${m} мес.`,
    days: (n: number) => `${n} ${plural(n, 'ден', 'дни')}`,
    decimalSeparator: ',',
    thousandsSeparator: '\u00a0',
  },

  /** Имена на категориите по ключ (ключът се пази в базата). */
  categories: {
    fuel: 'Гориво',
    service: 'Обслужване',
    repair: 'Ремонт',
    tires: 'Гуми',
    vignette: 'Винетка',
    liability: 'Гражданска отговорност',
    inspection: 'Технически преглед',
    casco: 'Каско',
    tax: 'Данък',
    parking: 'Паркинг',
    wash: 'Измиване',
    fine: 'Глоба',
    other: 'Друго',
  },

  /** Кратки имена на документите (за да се събират на един ред). */
  categoryShort: {
    liability: 'ГО',
    inspection: 'Техн. преглед',
  } as Record<string, string>,

  /** Части и консумативи за обслужване (ключът се пази в базата, името – не). */
  parts: {
    oil: 'Масло двигател',
    oilFilter: 'Маслен филтър',
    airFilter: 'Въздушен филтър',
    cabinFilter: 'Филтър купе',
    fuelFilter: 'Горивен филтър',
    timing: 'Ангренаж (ремък/ролки)',
    auxBelt: 'Пистов ремък',
    sparkPlugs: 'Свещи',
    brakePadsF: 'Накладки предни',
    brakePadsR: 'Накладки задни',
    brakeDiscs: 'Спирачни дискове',
    brakeFluid: 'Спирачна течност',
    coolant: 'Антифриз',
    gearboxOil: 'Масло скоростна кутия',
    battery: 'Акумулатор',
    wipers: 'Чистачки',
    tiresSummer: 'Летни гуми',
    tiresWinter: 'Зимни гуми',
    acService: 'Климатик (зареждане)',
  },

  periods: {
    annual: 'Годишна',
    quarterly: 'Тримесечна',
    monthly: 'Месечна',
    weekly: 'Седмична',
    weekend: 'Уикенд',
    months: (n: number) => `${n} ${plural(n, 'месец', 'месеца')}`,
    years: (n: number) => `${n} ${plural(n, 'година', 'години')}`,
  },

  /** Срок на документ (списък с колите, известия). */
  docs: {
    expiresToday: 'изтича днес',
    expiredAgo: (n: number) => `изтече преди ${n} ${plural(n, 'ден', 'дни')}`,
    daysLeft: (n: number) => `остават ${n} ${plural(n, 'ден', 'дни')}`,
  },

  // ---------- Екрани ----------

  cars: {
    title: 'Моите автомобили',
    add: '+ Кола',
    more: '⋮',
    empty: 'Все още нямате добавени автомобили.',
    addFirst: 'Добави автомобил',
    expenseCount: (n: number) => `${n} ${plural(n, 'разход', 'разхода')}`,
    alert: (category: string, text: string) => `${category}: ${text}`,
    dbError: (e: unknown) => `Базата данни не може да бъде отворена: ${e}`,
    scheduledNotifications: (n: number) => `Планирани известия: ${n}`,
    testNotification: 'Тестово известие (след 5 сек.)',
    notificationsOffTitle: 'Известията са изключени',
    notificationsOffMessage: 'Разрешете известията за приложението от настройките на телефона.',
  },

  carDialog: {
    newTitle: 'Нов автомобил',
    editTitle: 'Редакция на автомобил',
    nameMessage: 'Марка и модел (напр. „Шкода Октавия“)',
    plateMessage: 'Регистрационен номер (по желание)',
  },

  car: {
    options: 'Опции',
    total: 'Общо',
    inYear: (y: number) => `През ${y}`,
    fuelConsumption: 'Разход гориво',
    fuelValue: (v: string) => `${v} л/100`,
    documents: 'Документи',
    byCategory: 'По категории',
    noExpenses: 'Няма въведени разходи.',
    service: 'Обслужване',
    serviceOverdue: (n: number) => `Обслужване (${n}!)`,
    serviceSoon: (n: number) => `Обслужване (${n})`,
    addExpense: '+ Разход',
    noRecord: 'няма запис',
    docUntil: (date: string, left: string) => `до ${date} · ${left}`,
    docExpired: 'изтече!',
    docToday: 'днес',
    validUntil: (date: string) => `валидна до ${date}`,
    editCar: 'Редактирай автомобила',
    deleteCar: 'Изтрий автомобила',
    deleteExpenseConfirm: 'Сигурни ли сте, че искате да изтриете този разход?',
    deleteCarConfirm: (name: string) => `Ще бъдат изтрити „${name}“ и всички негови разходи. Продължаване?`,
    expenseTitle: (category: string, amount: string) => `${category} – ${amount}`,
  },

  expense: {
    newTitle: 'Нов разход',
    editTitle: 'Редакция на разход',
    category: 'Категория',
    amount: 'Сума (€) *',
    amountHint: '0.00',
    date: 'Дата',
    datePaid: 'Дата на плащане / начало',
    period: 'Срок',
    validUntil: 'Валидна до (включително)',
    odometer: 'Километраж (км)',
    optional: 'по желание',
    parts: 'Какво е сменено',
    liters: 'Заредени литри',
    litersHint: 'за изчисляване на разхода л/100 км',
    note: 'Бележка',
    noteHint: 'напр. смяна на масло и филтри',
    invalidAmount: 'Въведете валидна сума.',
    invalidNumber: (field: string) => `Невалидна стойност в „${field}“.`,
    validBeforeDate: '„Валидна до“ не може да е преди датата на плащане.',
  },

  service: {
    title: (car: string) => `Обслужване – ${car}`,
    lastOdometer: (km: string) => `Последен километраж: ${km}`,
    noOdometer: 'Няма въведен километраж',
    hint: 'Натиснете част, за да отбележите смяна или да промените интервала.',
    every: (parts: string) => `на ${parts}`,
    noInterval: 'без интервал',
    never: (interval: string) => `Няма записана смяна · ${interval}`,
    changed: (date: string, km: string | null, interval: string) =>
      `Сменено: ${date}${km ? ` при ${km}` : ''} · ${interval}`,
    atKm: (km: string) => `при ${km}`,
    kmLeft: (km: string) => ` (остават ${km})`,
    kmOverdue: (km: string) => ` (просрочено с ${km})`,
    byDate: (date: string) => `до ${date}`,
    or: ' или ',
    next: (when: string) => `Следваща: ${when}`,
    nextOverdue: (when: string) => `Просрочено! Следваща: ${when}`,
    markChanged: 'Отбележи смяна',
    editInterval: 'Промени интервала',
    viewLast: 'Виж последната смяна',
    intervalKm: 'Интервал в километри (0 или празно = без)',
    intervalMonths: 'Интервал в месеци (0 или празно = без)',
    invalidNumber: 'Въведете цяло положително число.',
  },

  notify: {
    channel: 'Изтичащи документи',
    expires: (days: number) => {
      if (days === 0) {
        return 'изтича днес'
      }

      if (days === 1) {
        return 'изтича утре'
      }

      return `изтича след ${days} дни`
    },
    title: (category: string, when: string) => `${category} ${when}`,
    body: (car: string, date: string) => `${car} – валидна до ${date}`,
    testTitle: 'Винетка изтича след 7 дни',
    testBody: 'Тестово известие от „Моята кола“',
  },
}

/** Текст по път, напр. t('car.total'). Връща самия път, ако няма такъв текст. */
export function t(path: string): string {
  const v = path
    .split('.')
    .reduce<unknown>((o, k) => (o != null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), L)

  return typeof v === 'string' ? v : path
}
