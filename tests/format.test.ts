import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysText, formatDate, formatDecimal, formatKm, formatMoney } from '../app/data/format'

const NBSP = ' '

test('formatMoney: запетая и интервал за хилядите', () => {
  assert.equal(formatMoney(7000), '70,00 €')
  assert.equal(formatMoney(123456), `1${NBSP}234,56 €`)
  assert.equal(formatMoney(5), '0,05 €')
})

test('formatKm и formatDecimal', () => {
  assert.equal(formatKm(171715), `171${NBSP}715 км`)
  assert.equal(formatDecimal(41.9), '41,9')
  assert.equal(formatDecimal(42), '42')
  assert.equal(formatDecimal(6.2, 1), '6,2')
})

test('formatDate и daysText', () => {
  assert.equal(formatDate('2027-03-12'), '12.03.2027')
  assert.equal(daysText(0), 'изтича днес')
  assert.equal(daysText(1), 'остават 1 ден')
  assert.equal(daysText(-3), 'изтече преди 3 дни')
})
