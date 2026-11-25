/*
In NativeScript, the app.ts file is the entry point to your application.
You can use this file to perform app-level initialization, but the primary
purpose of the file is to pass control to the app’s first module.
*/

import { Application } from '@nativescript/core'
import { onDataChanged } from './data/store'
import { dbReady } from './data/db'
import { t } from './strings'
import { rescheduleNotifications } from './data/notify'

// текстовете в XML: {{ t('cars.title') }}
Application.setResources({ ...Application.getResources(), t })

// известията се преизчисляват при всяка промяна на данните и при стартиране
onDataChanged(() => rescheduleNotifications())
Application.on(Application.launchEvent, () => {
  dbReady.then(() => setTimeout(() => rescheduleNotifications(), 1500))
})

Application.run({ moduleName: 'app-root' })

/*
Do not place any code after the application has been started as it will not
be executed on iOS.
*/
