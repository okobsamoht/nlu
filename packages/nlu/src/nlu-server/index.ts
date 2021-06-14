import bytes from 'bytes'
import chalk from 'chalk'
import _ from 'lodash'
import path from 'path'
import Logger, { centerText } from '../utils/logger'
import { LoggerLevel } from '../utils/logger/typings'
import API from './api'
import { CommandLineOptions, getConfig } from './config'
import { copyDir } from './copy-dir'
import { displayDocumentation } from './documentation'
import { makeEngine } from './make-engine'

export default async function (cliOptions: CommandLineOptions, version: string) {
  const { options, source: configSource } = await getConfig(cliOptions)

  Logger.configure({
    level: Number(options.verbose) !== NaN ? Number(options.verbose) : LoggerLevel.Info,
    filters: options.logFilter
  })

  const launcherLogger = Logger.sub('Launcher')
  launcherLogger.configure({
    minLevel: LoggerLevel.Info // Launcher always display
  })

  for (const dir of ['./pre-trained', './stop-words']) {
    // TODO: no need for copy to APP_DATA_PATH, just use original files
    const srcPath = path.resolve(__dirname, '../../assets', dir)
    const destPath = path.resolve(process.APP_DATA_PATH, dir)
    await copyDir(srcPath, destPath)
  }

  if (!bytes(options.bodySize)) {
    throw new Error(`Specified body-size "${options.bodySize}" has an invalid format.`)
  }

  launcherLogger.debug('NLU Server Options %o', options)

  const engine = await makeEngine(options, launcherLogger)

  launcherLogger.info(chalk`========================================
      {bold ${centerText('Botpress Standalone NLU', 40, 9)}}
      {dim ${centerText(`Version ${version}`, 40, 9)}}
${_.repeat(' ', 9)}========================================`)

  if (configSource === 'environment') {
    launcherLogger.info('Loading config from environment variables')
  } else if (configSource === 'file') {
    launcherLogger.info(`Loading config from file "${cliOptions.config}"`)
  }

  if (options.authToken?.length) {
    launcherLogger.info(`authToken: ${chalk.greenBright('enabled')} (only users with this token can query your server)`)
  } else {
    launcherLogger.info(`authToken: ${chalk.redBright('disabled')} (anyone can query your nlu server)`)
  }

  if (options.limit) {
    launcherLogger.info(
      `limit: ${chalk.greenBright('enabled')} allowing ${options.limit} requests/IP address in a ${
        options.limitWindow
      } timeframe `
    )
  } else {
    launcherLogger.info(`limit: ${chalk.redBright('disabled')} (no protection - anyone can query without limitation)`)
  }

  if (options.ducklingEnabled) {
    launcherLogger.info(`duckling: ${chalk.greenBright('enabled')} url=${options.ducklingURL}`)
  } else {
    launcherLogger.info(`duckling: ${chalk.redBright('disabled')}`)
  }
  for (const langSource of options.languageSources) {
    launcherLogger.info(`lang server: url=${langSource.endpoint}`)
  }

  launcherLogger.info(`body size: allowing HTTP requests body of size ${options.bodySize}`)

  if (options.dbURL) {
    launcherLogger.info('models stored in the database')
  } else {
    launcherLogger.info(`models stored at "${options.modelDir}"`)
  }

  if (options.batchSize > 0) {
    launcherLogger.info(`batch size: allowing up to ${options.batchSize} predictions in one call to POST /predict`)
  }

  options.doc && displayDocumentation(launcherLogger, options)

  await API(options, engine, version)

  launcherLogger.info(`NLU Server is ready at http://${options.host}:${options.port}/`)
}