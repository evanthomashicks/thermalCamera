const SerialPort = require('serialport')
const Readline = require('@serialport/parser-readline')
const fs = require('fs')
const path = require('path')
const Utils = require('./utils')

const logger = require('@natfaulk/supersimplelogger')('Index')

const DATA_DIR = path.join(__dirname, '..', 'data')
const FILE_PREFIX = 'sav'
const MSG_HEADER = '[data] '

;(async ()=>{
  logger('Process started')
  
  let timeToRecord = null
  if (process.argv.length >= 3) 
  {
    timeToRecord = parseInt(process.argv[2])*1000
    logger(`Setting record time to ${timeToRecord} seconds`)
  } else logger('INFO: You can add an integer to the command line arguements to set the time to record in seconds. Defaults to forever otherwise')

  let outputStream = null

  Utils.mkdir_p(DATA_DIR)
  
  let outputFile = getNextFile(DATA_DIR, FILE_PREFIX)
  logger(`Creating output file: ${outputFile}`)
  outputStream = fs.createWriteStream(outputFile)

  let ports = await SerialPort.list()
  ports.forEach(_port => {
    if (
      _port.manufacturer === 'wch.cn'     // windows
      || _port.manufacturer === '1a86'    // linux
    ) {
      logger(`Found port ${_port.path}`)
      openPort(_port.path, outputStream, timeToRecord)
    }
  })

})()

function openPort(_path, _outputStream, _timeToRecord) {
  logger(`Opening ${_path}...`)
  let timerStarted = false

  let isThermoBoard = false

  const port = new SerialPort(_path, {
    baudRate: 115200
  })

  const parser = port.pipe(new Readline({delimiter: '\n'}))
  parser.on('data', _data => {
    _data = _data.trim()
    logger(_data)

    if (isThermoBoard && _data.startsWith(MSG_HEADER)) {
      if (!timerStarted) {
        timerStarted = true
        if (_timeToRecord !== null && _timeToRecord !== undefined) setTimeout(()=>{
          // tell device to stop sending data
          port.write('e')
          // give the port time to send through all its data
          setTimeout(() => {
            port.close(_err => {
              if (_err) logger(`Error closing port: ${_path}`)
              else logger(`Closed port: ${_path}`)
            })
          } , 200)
        }, _timeToRecord)
      }

      if (_outputStream!==null) {
        _outputStream.write(`Time|${Date.now()}|`)
        _outputStream.write(_data)
        _outputStream.write('\n')
      }
    } else if (!isThermoBoard && _data.includes('Thermo board')) isThermoBoard = true
    // else logger('Invalid serial data')
  })

  port.on('error', err => {
    logger(`[${_path}] Error: `, err.message)
  })

  port.on('open', () => {
    logger(`[${_path}] Port opened.`)
    logger(`[${_path}] Sending reset command...`)
    port.write('r')

    // wait for it to boot up
    setTimeout(() => {
      // request board type
      port.write('i')
    }, 5000)
  })

  setTimeout(()=>{
    if (!isThermoBoard) {
      logger(`[${_path}] Serial port is not a thermo board. Closing...`)
      port.close(_err => {
        if (_err) logger(`[${_path}] Failed to close port...`)
        else logger(`[${_path}] Port closed.`)
      })
    } else {
      port.write('s')
    }
  }, 10000)

  return port
}

function getNextFile(_dir, _prefix) {
  let currentFiles = fs.readdirSync(_dir)
  let makeFilename = _i => {
    return `${_prefix}_${_i}.txt`
  }

  let i = 0
  while (currentFiles.includes(makeFilename(i))) ++i

  return path.join(_dir, makeFilename(i))
}

