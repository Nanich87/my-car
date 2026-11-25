import { Dialogs } from '@nativescript/core'
import { Car, saveCar } from '../data/store'
import { L } from '../strings'

/** Диалог за добавяне/редакция на автомобил. Връща записания автомобил или null. */
export async function editCarDialog(car?: Car): Promise<Car | null> {
  const nameRes = await Dialogs.prompt({
    title: car ? L.carDialog.editTitle : L.carDialog.newTitle,
    message: L.carDialog.nameMessage,
    defaultText: car ? car.name : '',
    okButtonText: L.common.next,
    cancelButtonText: L.common.cancel,
  })
  const name = (nameRes.text || '').trim()
  if (!nameRes.result || !name) return null

  const plateRes = await Dialogs.prompt({
    title: name,
    message: L.carDialog.plateMessage,
    defaultText: car ? car.plate : '',
    okButtonText: L.common.save,
    cancelButtonText: L.common.cancel,
  })
  if (!plateRes.result) return null

  return saveCar({ id: car?.id, name, plate: (plateRes.text || '').trim().toUpperCase() })
}
