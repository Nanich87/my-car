import { Dialogs } from '@nativescript/core'
import { Car, saveCar } from '../data/store'

/** Диалог за добавяне/редакция на автомобил. Връща записания автомобил или null. */
export async function editCarDialog(car?: Car): Promise<Car | null> {
  const nameRes = await Dialogs.prompt({
    title: car ? 'Редакция на автомобил' : 'Нов автомобил',
    message: 'Марка и модел (напр. „Шкода Октавия“)',
    defaultText: car ? car.name : '',
    okButtonText: 'Напред',
    cancelButtonText: 'Отказ',
  })
  const name = (nameRes.text || '').trim()
  if (!nameRes.result || !name) return null

  const plateRes = await Dialogs.prompt({
    title: name,
    message: 'Регистрационен номер (по желание)',
    defaultText: car ? car.plate : '',
    okButtonText: 'Запази',
    cancelButtonText: 'Отказ',
  })
  if (!plateRes.result) return null

  return saveCar({ id: car?.id, name, plate: (plateRes.text || '').trim().toUpperCase() })
}
