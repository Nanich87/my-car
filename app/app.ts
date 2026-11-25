/*
In NativeScript, the app.ts file is the entry point to your application.
You can use this file to perform app-level initialization, but the primary
purpose of the file is to pass control to the app’s first module.
*/

import { Application } from '@nativescript/core'
import { dbReady } from './data/db'
import { requestReschedule } from './data/notify'
import { onDataChanged } from './data/store'
import { t } from './strings'

// текстовете в XML: {{ t('cars.title') }}
Application.setResources({ ...Application.getResources(), t })

// известията се пренареждат след промяна на данните и при стартиране
onDataChanged(requestReschedule)
Application.on(Application.launchEvent, () => {
  dbReady.then(requestReschedule).catch((e) => console.error('dbReady', e))
})

Application.run({ moduleName: 'app-root' })

/*
Do not place any code after the application has been started as it will not
be executed on iOS.
*/
