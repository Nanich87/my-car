import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  addMonths,
  byCategory,
  computeExpiry,
  daysBetween,
  documentStatus,
  fuelConsumption,
  parseDecimal,
  serviceStatus,
  sumCents,
  withDefaultIntervals,
} from '../app/data/logic'
import { DOCUMENT_PERIODS, Expense } from '../app/data/model'

let seq = 0
function exp(e: Partial<Expense>): Expense {
  return { id: String(++seq), carId: 'c1', date: '2026-01-01', category: 'other', amountCents: 0, ...e }
}

describe('дати', () => {
  test('addMonths не прелива в следващия месец', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
    assert.equal(addMonths('2024-01-31', 1), '2024-02-29') // високосна
    assert.equal(addMonths('2026-03-31', 1), '2026-04-30')
    assert.equal(addMonths('2026-03-15', 12), '2027-03-15')
    assert.equal(addMonths('2026-11-30', 3), '2027-02-28')
  })

  test('daysBetween през смяна на часовото време', () => {
    assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2)
    assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2)
    assert.equal(daysBetween('2026-01-10', '2026-01-05'), -5)
  })

  test('computeExpiry: начало + период − 1 ден', () => {
    const [annual, , monthly, weekly, weekend] = DOCUMENT_PERIODS.vignette
    assert.equal(computeExpiry('2026-11-25', annual), '2027-11-24')
    assert.equal(computeExpiry('2026-01-31', monthly), '2026-02-27')
    assert.equal(computeExpiry('2026-11-25', weekly), '2026-12-01')
    assert.equal(computeExpiry('2026-11-27', weekend), '2026-11-29')
    assert.equal(computeExpiry('2026-03-01', DOCUMENT_PERIODS.inspection[1]), '2028-02-29')
  })
})

describe('parseDecimal', () => {
  test('приема запетая и интервали', () => {
    assert.equal(parseDecimal('12,50'), 12.5)
    assert.equal(parseDecimal('12.5'), 12.5)
    assert.equal(parseDecimal(' 1 234,5 '), 1234.5)
    assert.equal(parseDecimal(70), 70)
  })
  test('празно = null, невалидно = NaN', () => {
    assert.equal(parseDecimal(''), null)
    assert.equal(parseDecimal(undefined), null)
    assert.ok(Number.isNaN(parseDecimal('abc') as number))
    assert.ok(Number.isNaN(parseDecimal('1.2.3') as number))
    assert.ok(Number.isNaN(parseDecimal('12€') as number))
  })
})

describe('разходи', () => {
  test('sumCents и byCategory без грешки от закръгляне', () => {
    const list = [10, 20, 30]
      .map((c) => exp({ category: 'fuel', amountCents: c }))
      .concat(exp({ category: 'tax', amountCents: 100 }))
    assert.equal(sumCents(list), 160)
    assert.deepEqual(byCategory(list), [
      { category: 'tax', totalCents: 100 },
      { category: 'fuel', totalCents: 60 },
    ])
  })

  test('fuelConsumption не брои литрите от първото зареждане', () => {
    const fills = [
      exp({ category: 'fuel', odometer: 1000, liters: 40 }),
      exp({ category: 'fuel', odometer: 1500, liters: 30 }),
      exp({ category: 'fuel', odometer: 2000, liters: 35 }),
    ]
    assert.equal(fuelConsumption(fills), 6.5)
    assert.equal(fuelConsumption(fills.slice(0, 1)), null)
    assert.equal(fuelConsumption([exp({ category: 'service', odometer: 1, liters: 1 })]), null)
  })
})

describe('documentStatus', () => {
  const today = '2026-11-25'
  test('изтекъл / скоро / наред / няма', () => {
    const st = documentStatus(
      [
        exp({ category: 'vignette', validUntil: '2026-12-06' }),
        exp({ category: 'liability', validUntil: '2026-11-21' }),
        exp({ category: 'liability', validUntil: '2025-11-21' }),
      ],
      today,
    )
    assert.deepEqual(
      st.map((d) => [d.category, d.state, d.daysLeft]),
      [
        ['vignette', 'soon', 11],
        ['liability', 'expired', -4],
        ['inspection', 'none', undefined],
      ],
    )
  })
  test('взима документа с най-късна валидност; каско само ако има запис', () => {
    const st = documentStatus(
      [
        exp({ category: 'vignette', validUntil: '2026-12-01' }),
        exp({ category: 'vignette', validUntil: '2027-12-01' }),
        exp({ category: 'casco', validUntil: '2027-01-01' }),
      ],
      today,
    )
    assert.equal(st.find((d) => d.category === 'vignette')?.state, 'ok')
    assert.equal(st.find((d) => d.category === 'casco')?.state, 'ok')
    assert.equal(documentStatus([], today).length, 3)
  })
})

describe('serviceStatus', () => {
  const intervals = withDefaultIntervals({ oil: { km: 10000, months: 12 }, wipers: { km: 0, months: 1 } })
  const status = (exps: Expense[], today: string, key: string) =>
    serviceStatus(exps, intervals, today).find((s) => s.item.key === key)

  test('просрочено по километри', () => {
    const exps = [
      exp({ date: '2026-01-10', odometer: 100000, parts: ['oil'] }),
      exp({ date: '2026-06-01', odometer: 110500 }),
    ]
    const s = status(exps, '2026-06-01', 'oil')
    assert.equal(s?.state, 'overdue')
    assert.equal(s?.dueKm, 110000)
  })

  test('наближава по километри (под 1000 км)', () => {
    const exps = [exp({ date: '2026-01-10', odometer: 100000, parts: ['oil'] }), exp({ odometer: 109500 })]
    assert.equal(status(exps, '2026-02-01', 'oil')?.state, 'soon')
  })

  test('срокът по дата не прелива в края на месеца', () => {
    const s = status([exp({ date: '2026-01-31', parts: ['wipers'] })], '2026-02-01', 'wipers')
    assert.equal(s?.dueDate, '2026-02-28')
    assert.equal(s?.state, 'soon')
  })

  test('без смяна → never; взима последната смяна', () => {
    assert.equal(status([], '2026-01-01', 'oil')?.state, 'never')
    const exps = [
      exp({ date: '2025-01-01', odometer: 50000, parts: ['oil'] }),
      exp({ date: '2026-01-01', odometer: 60000, parts: ['oil'] }),
    ]
    assert.equal(status(exps, '2026-01-02', 'oil')?.dueKm, 70000)
  })
})
