import { app } from 'electron'
import { configureMainProcessEnvironment } from './application/environment'
import { registerApplicationLifecycle } from './application/lifecycle'

const environment = configureMainProcessEnvironment(app, process.argv)
registerApplicationLifecycle(app, environment)
