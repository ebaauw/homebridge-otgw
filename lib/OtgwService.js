// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019-2022 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('homebridge-lib')

class OtgwService extends homebridgeLib.ServiceDelegate {
  programCommand (value) {
    const buffer = Buffer.from(value, 'base64')
    this.debug(
      'Program Command changed to %s', buffer.toString('hex').toUpperCase()
    )
    for (let i = 0; i < buffer.length; i++) {
      const opcode = buffer[i]
      switch (opcode) {
        case 0x00: // Begin
          this.debug('  00 begin')
          break
        case 0x06: // End
          this.debug('  06 end')
          break
        case 0x12: // Offset
          {
            const offset = buffer.readInt8(++i) / 10
            this.debug('  12 offset: %s°C', offset.toFixed(1))
          }
          break
        case 0x13: // Schedule Enable
          this.values.schedule = buffer[++i] === 1
          this.debug('  13 schudule_on %s', this.values.schedule)
          break
        case 0x1A: // Away transitions
          {
            let s = ''
            for (let j = 1; j <= 8; j++) {
              if (buffer[i + j] !== 0xFF) {
                const time = buffer[i + j] * 10
                const h = ('0' + Math.floor(time / 60)).slice(-2)
                const m = ('0' + time % 60).slice(-2)
                s += ' ' + h + ':' + m
              }
            }
            this.debug('  1A Free%s', s)
            i += 8
          }
          break
        case 0xF4: // Temperature
          {
            const now = (buffer[++i] / 2).toFixed(1)
            const low = (buffer[++i] / 2).toFixed(1)
            const high = (buffer[++i] / 2).toFixed(1)
            this.debug('  F4 temp: %s°C, %s°C, %s°C', now, low, high)
          }
          break
        case 0xFC: // Time
          {
            const n = ('0' + buffer[++i]).slice(-2)
            const h = ('0' + buffer[++i]).slice(-2)
            const d = ('0' + buffer[++i]).slice(-2)
            const m = ('0' + buffer[++i]).slice(-2)
            const y = 2000 + buffer[++i]
            this.debug('  FC time: %s-%s-%sT%s:%s', y, m, d, h, n)
          }
          break
        case 0xFA: // Daily transitions
          for (let d = 0; d <= 6; d++) {
            let s = ''
            for (let j = 1; j <= 8; j++) {
              if (buffer[i + j] !== 0xFF) {
                const time = buffer[i + j] * 10
                const h = ('0' + Math.floor(time / 60)).slice(-2)
                const m = ('0' + time % 60).slice(-2)
                s += ' ' + h + ':' + m
              }
            }
            this.debug(
              '  %s %s',
              ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d], s
            )
            i += 8
          }
          break
        case 0xFF: // Reset?
          i += 2
          this.debug('  FF reset')
          break
        default: // Unknown
          this.debug(
            '  %s (unknown)',
            ('00' + buffer[i].toString(16).toUpperCase()).slice(-2)
          )
          break
      }
    }
  }

  programData () {
    let buffer = Buffer.alloc(1024)
    let offset = 0

    // Temperature Offset
    // buffer[offset++] = 0x12
    // buffer[offset++] = 0x00
    // Scheduler
    buffer[offset++] = 0x13
    buffer[offset++] = this.values.schedule ? 0x01 : 0x00
    // Install Status
    buffer[offset++] = 0x14
    buffer[offset++] = 0xC0
    // Vacation
    // buffer[offset++] = 0x19
    // buffer[offset++] = 0x00
    // buffer[offset++] = 0xFF
    // Temperature
    // buffer[offset++] = 0xF4
    // buffer[offset++] = 15 * 2
    // buffer[offset++] = 15 * 2
    // buffer[offset++] = 15 * 2
    // buffer[offset++] = 15 * 2
    // Time
    buffer[offset++] = 0xFC
    const dt = new Date()
    buffer[offset++] = dt.getMinutes()
    buffer[offset++] = dt.getHours()
    buffer[offset++] = dt.getDate()
    buffer[offset++] = dt.getMonth() + 1
    buffer[offset++] = dt.getFullYear() - 2000
    // Open Window
    // buffer[offset++] = 0xF6
    // buffer[offset++] = 0x00
    // buffer[offset++] = 0x00
    // buffer[offset++] = 0x00
    // Schedule
    // buffer[offset++] = 0xFA
    // for (let d = 0; d <= 6; d++) {
    //   buffer[offset++] = 0xFF
    //   buffer[offset++] = 0xFF
    //   buffer[offset++] = 0xFF
    //   buffer[offset++] = 0xFF
    //   buffer[offset++] = 0xFF
    //   buffer[offset++] = 0xFF
    //   buffer[offset++] = 0xFF
    //   buffer[offset++] = 0xFF
    // }
    // Free day
    // buffer[offset++] = 0x1A
    // buffer[offset++] = 0xFF
    // buffer[offset++] = 0xFF
    // buffer[offset++] = 0xFF
    // buffer[offset++] = 0xFF
    // buffer[offset++] = 0xFF
    // buffer[offset++] = 0xFF
    // buffer[offset++] = 0xFF
    // buffer[offset++] = 0xFF

    buffer = buffer.slice(0, offset)
    return buffer.toString('base64')
  }

  static get Thermostat () {
    return class Thermostat extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.eve.Thermostat
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            minValue: this.Characteristics.hap.TargetHeatingCoolingState.OFF,
            maxValue: this.Characteristics.hap.TargetHeatingCoolingState.HEAT
          },
          value: this.Characteristics.hap.TargetHeatingCoolingState.HEAT
        })
        this.values.targetState = this.Characteristics.hap.TargetHeatingCoolingState.HEAT
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'targetTemperature',
          Characteristic: this.Characteristics.hap.TargetTemperature,
          unit: '°C',
          props: { minValue: 5, maxValue: 30, minStep: 0.5 }
        }).on('didSet', async (value, fromHomeKit) => {
          try {
            if (fromHomeKit) {
              await this.setTemperature(value)
            } else if (
              this.values.step === 0 && this.values.override !== 0 &&
              value !== this.values.override
            ) {
              await this.setTemperature(0)
            }
          } catch (error) { this.warn(error) }
        })
        this.addCharacteristicDelegate({
          key: 'override',
          unit: '°C',
          value: 0
        }).on('didSet', (value) => {
          this.values.schedule = value === 0
        })
        this.addCharacteristicDelegate({
          key: 'step',
          value: 0
        })
        this.values.step = 0
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'valvePosition',
          Characteristic: this.Characteristics.eve.ValvePosition,
          unit: '%'
        })
        this.addCharacteristicDelegate({
          key: 'schedule'
        })
        this.addCharacteristicDelegate({
          key: 'programCommand',
          Characteristic: this.Characteristics.eve.ProgramCommand,
          silent: true
        }).on('didSet', async (value) => {
          try {
            const oldSchedule = this.values.schedule
            this.programCommand(value)
            if (this.values.schedule !== oldSchedule) {
              await this.setTemperature(
                this.values.schedule ? 0 : this.values.targetTemperature
              )
            }
          } catch (error) { this.warn(error) }
        })
        this.addCharacteristicDelegate({
          key: 'programData',
          Characteristic: this.Characteristics.eve.ProgramData,
          silent: true,
          getter: async () => {
            return this.programData()
          }
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })
        this.addCharacteristicDelegate({
          key: 'logLevel',
          Characteristic: this.Characteristics.my.LogLevel,
          value: otgwAccessory.platform.logLevel
        }).on('didSet', (value) => {
          otgwAccessory.logLevel = value
        })
      }

      checkState (state) {
        this.debug('state: %j', state)
        let updated = false
        if (state.room_setpoint_remote_override != null) {
          if (
            this.values.step === 1 &&
            state.room_setpoint_remote_override === this.values.override
          ) {
            this.values.step = this.values.override === 0 ? 0 : 2
          }
          if (
            this.values.step === 0 &&
            state.room_setpoint_remote_override !== this.values.override
          ) {
            this.values.override = state.room_setpoint_remote_override
            this.values.step = this.values.override === 0 ? 0 : 2
          }
        }
        if (state.master_status_ch_enable != null) {
          this.values.targetState =
            this.Characteristics.hap.TargetHeatingCoolingState.HEAT
          this.values.state = state.master_status_ch_enable
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          updated = true
        }
        if (state.room_temperature != null) {
          this.values.temperature = Math.round(state.room_temperature * 10) / 10
          updated = true
        }
        if (state.room_setpoint != null) {
          state.room_setpoint = Math.round(state.room_setpoint * 2) / 2
          if (
            this.values.step === 2 &&
            state.room_setpoint === this.values.override
          ) {
            this.values.step = 0
          }
          if (this.values.step === 0) {
            this.values.targetTemperature = state.room_setpoint
            updated = true
          }
        }
        if (state.max_relative_modulation_setting != null) {
          this.values.valvePosition = state.max_relative_modulation_setting
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }

      async setTemperature (value) {
        try {
          this.values.step = 1
          this.values.override = value
          await this.platform.client.command('TT=' + value)
        } catch (error) {
          this.values.step = 0
          this.warn(error)
        }
      }
    }
  }

  static get Leak () {
    return class Leak extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.hap.LeakSensor
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'LeakDetected',
          Characteristic: this.Characteristics.hap.LeakDetected
        })
      }

      checkState (state) {
        if (state.slave_status_fault != null) {
          this.values.LeakDetected = state.slave_status_fault ? 1 : 0
        }
      }
    }
  }

  static get Boiler () {
    return class Boiler extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.eve.Thermostat
        super(otgwAccessory, params)

        if (params.state.max_ch_setpoint_min > 0 && params.state.max_ch_setpoint_max > 0) {
          this.log(
            'boundaries: min: %d°C, max: %d°C',
            params.state.max_ch_setpoint_min, params.state.max_ch_setpoint_max
          )
        } else {
          params.state.max_ch_setpoint_min = 25
          params.state.max_ch_setpoint_max = 80
        }

        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            minValue: this.Characteristics.hap.TargetHeatingCoolingState.OFF,
            maxValue: this.Characteristics.hap.TargetHeatingCoolingState.HEAT
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'targetTemperature',
          Characteristic: this.Characteristics.hap.TargetTemperature,
          unit: '°C',
          props: {
            minValue: 0,
            maxValue: 100
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'valvePosition',
          Characteristic: this.Characteristics.eve.ValvePosition,
          unit: '%'
        })
        this.addCharacteristicDelegate({
          key: 'programCommand',
          Characteristic: this.Characteristics.eve.ProgramCommand
        })
        this.addCharacteristicDelegate({
          key: 'programData',
          Characteristic: this.Characteristics.eve.ProgramData,
          value: Buffer.from('ff04f6', 'hex').toString('base64')
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })
        this.addCharacteristicDelegate({
          key: 'statusFault',
          Characteristic: this.Characteristics.hap.StatusFault
        })
      }

      checkState (state, fromBody) {
        this.debug('state: %j', state)
        let updated = false
        if (state.slave_status_flame_status != null) {
          this.values.state = state.slave_status_flame_status
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          updated = true
        }
        if (state.master_status_ch_enable != null) {
          this.values.targetState = state.master_status_ch_enable
            ? this.Characteristics.hap.TargetHeatingCoolingState.HEAT
            : this.Characteristics.hap.TargetHeatingCoolingState.OFF
        }
        if (state.boiler_water_temperature != null) {
          this.values.temperature = Math.round(state.boiler_water_temperature * 10) / 10
          updated = true
        }
        if (state.control_setpoint != null) {
          this.values.targetTemperature = Math.round(state.control_setpoint * 10) / 10
          updated = true
        }
        if (state.relative_modulation_level != null) {
          this.values.valvePosition = state.relative_modulation_level
          updated = true
        }
        if (state.slave_status_fault != null) {
          this.values.statusFault = state.slave_status_fault
          updated = true
        }
        if (state.return_water_temperature != null && (fromBody || state.return_water_temperature > 0)) {
          if (this.values.returnWaterTemperature === undefined) {
            this.addCharacteristicDelegate({
              key: 'returnWaterTemperature',
              unit: '°C',
              Characteristic: this.Characteristics.my.ReturnWaterTemperature
            })
          }
          this.values.returnWaterTemperature = Math.round(state.return_water_temperature * 10) / 10
          updated = true
        }
        if (state.ch_water_pressure != null && (fromBody || state.ch_water_pressure > 0)) {
          if (this.values.waterPressure === undefined) {
            this.addCharacteristicDelegate({
              key: 'waterPressure',
              Characteristic: this.Characteristics.my.WaterPressure
            })
          }
          this.values.waterPressure = state.ch_water_pressure
          updated = true
        }
        if (state.burner_starts != null && (fromBody || state.burner_starts > 0)) {
          if (this.values.burnerStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerStarts',
              Characteristic: this.Characteristics.my.BurnerStarts
            })
          }
          this.values.burnerStarts = state.burner_starts
          updated = true
        }
        if (state.ch_pump_starts != null && (fromBody || state.ch_pump_starts > 0)) {
          if (this.values.pumpStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpStarts',
              Characteristic: this.Characteristics.my.PumpStarts
            })
          }
          this.values.pumpStarts = state.ch_pump_starts
          updated = true
        }
        if (state.burner_operation_hours != null && (fromBody || state.burner_operation_hours > 0)) {
          if (this.values.burnerHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerHours',
              Characteristic: this.Characteristics.my.BurnerHours
            })
          }
          this.values.burnerHours = state.burner_operation_hours
          updated = true
        }
        if (state.ch_pump_operation_hours != null && (fromBody || state.ch_pump_operation_hours > 0)) {
          if (this.values.pumpHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpHours',
              Characteristic: this.Characteristics.my.PumpHours
            })
          }
          this.values.pumpHours = state.ch_pump_operation_hours
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }
    }
  }

  static get HotWater () {
    return class HotWater extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.eve.Thermostat
        super(otgwAccessory, params)

        if (params.state.dhw_setpoint_min > 0 && params.state.dhw_setpoint_max > 0) {
          this.log(
            'boundaries: min: %d°C, max: %d°C',
            params.state.dhw_setpoint_min, params.state.dhw_setpoint_max
          )
        } else {
          params.state.dhw_setpoint_min = 35
          params.state.dhw_setpoint_max = 65
        }
        this.temperatureKey = params.state.dhw_temperature > 0
          ? 'dhw_temperature'
          : 'boiler_water_temperature'

        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            minValue: this.Characteristics.hap.TargetHeatingCoolingState.OFF,
            maxValue: this.Characteristics.hap.TargetHeatingCoolingState.HEAT
          }
        }).on('didSet', async (value, byHomeKit) => {
          if (this.platform.client != null && byHomeKit) {
            let command
            switch (value) {
              case this.Characteristics.hap.TargetHeatingCoolingState.OFF:
                command = 0
                break
              case this.Characteristics.hap.TargetHeatingCoolingState.HEAT:
              default:
                command = 1
                break
            }
            this.waiting = true
            await this.platform.client.command('HW=' + command)
            this.values.schedule = false
            this.waiting = false
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'targetTemperature',
          Characteristic: this.Characteristics.hap.TargetTemperature,
          unit: '°C',
          props: {
            minValue: params.state.dhw_setpoint_min,
            maxValue: params.state.dhw_setpoint_max
          }
        }).on('didSet', async (value, byHomeKit) => {
          if (this.platform.client != null && byHomeKit) {
            this.waitingTargetTemperature = true
            await this.platform.client.command('SW=' + value)
            this.waitingTargetTemperature = false
          }
        })
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'valvePosition',
          Characteristic: this.Characteristics.eve.ValvePosition,
          unit: '%'
        })
        this.addCharacteristicDelegate({
          key: 'schedule'
        })
        this.addCharacteristicDelegate({
          key: 'programCommand',
          Characteristic: this.Characteristics.eve.ProgramCommand,
          silent: true
        }).on('didSet', async (value) => {
          try {
            const oldSchedule = this.values.schedule
            this.programCommand(value)
            if (this.values.schedule !== oldSchedule) {
              await this.platform.client.command(
                'HW=' + (value ? 'A' : this.values.state ? 1 : 0)
              )
            }
          } catch (error) { this.warn(error) }
        })
        this.addCharacteristicDelegate({
          key: 'programData',
          Characteristic: this.Characteristics.eve.ProgramData,
          silent: true,
          getter: async () => {
            return this.programData()
          }
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })

        this.accessoryDelegate.once('heartbeat', (beat) => {
          this.beat = (beat % 60) + 5
        })
        this.accessoryDelegate.on('heartbeat', async (beat) => {
          await this.heartbeat(beat)
        })
      }

      checkState (state, fromBody) {
        this.debug('state: %j', state)
        let updated = false
        if (state.slave_status_dhw_mode != null) {
          this.values.state = state.slave_status_dhw_mode
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          this.values.valvePosition = state.slave_status_dhw_mode ? 100 : 0
          updated = true
        }
        if (state.master_status_dhw_enable != null && !this.waiting) {
          this.values.targetState = state.master_status_dhw_enable
            ? this.Characteristics.hap.TargetHeatingCoolingState.HEAT
            : this.Characteristics.hap.TargetHeatingCoolingState.OFF
        }
        if (state[this.temperatureKey] != null) {
          this.values.temperature = Math.round(state[this.temperatureKey] * 10) / 10
        }
        if (state.dhw_setpoint != null) {
          this.values.targetTemperature = Math.round(state.dhw_setpoint * 10) / 10
          updated = true
        }
        if (state.dhw_burner_starts != null && (fromBody || state.dhw_burner_starts > 0)) {
          if (this.values.burnerStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerStarts',
              Characteristic: this.Characteristics.my.BurnerStarts
            })
          }
          this.values.burnerStarts = state.dhw_burner_starts
          updated = true
        }
        if (state.dhw_pump_starts != null && (fromBody || state.dhw_pump_starts > 0)) {
          if (this.values.pumpStarts === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpStarts',
              Characteristic: this.Characteristics.my.PumpStarts
            })
          }
          this.values.pumpStarts = state.dhw_pump_starts
          updated = true
        }
        if (state.dhw_burner_operation_hours != null && (fromBody || state.dhw_burner_operation_hours > 0)) {
          if (this.values.burnerHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'burnerHours',
              Characteristic: this.Characteristics.my.BurnerHours
            })
          }
          this.values.burnerHours = state.dhw_burner_operation_hours
          updated = true
        }
        if (state.dhw_pump_operation_hours != null && (fromBody || state.dhw_pump_operation_hours > 0)) {
          if (this.values.pumpHours === undefined) {
            this.addCharacteristicDelegate({
              key: 'pumpHours',
              Characteristic: this.Characteristics.my.PumpHours
            })
          }
          this.values.pumpHours = state.dhw_pump_operation_hours
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }

      async heartbeat (beat) {
        if (beat % 60 === this.beat && this.platform.client != null) {
          try {
            const hotWater = await this.platform.client.command('PR=W')
            this.values.schedule = hotWater === 'W=A'
          } catch (error) {
            this.warn(error)
          }
        }
      }
    }
  }

  static get OutsideTemperature () {
    return class OutsideTemperature extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        params.name = otgwAccessory.name
        params.Service = otgwAccessory.Services.eve.TemperatureSensor
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'temperature',
          Characteristic: this.Characteristics.eve.CurrentTemperature,
          unit: '°C'
        })
        this.addCharacteristicDelegate({
          key: 'temperatureUnit',
          Characteristic: this.Characteristics.hap.TemperatureDisplayUnits,
          value: this.Characteristics.hap.TemperatureDisplayUnits.CELSIUS
        })
        this.addCharacteristicDelegate({
          key: 'lastUpdated',
          Characteristic: this.Characteristics.my.LastUpdated,
          silent: true
        })
      }

      checkState (state) {
        let updated = false
        if (state.outside_temperature != null) {
          this.values.temperature = Math.round(state.outside_temperature * 10) / 10
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).slice(0, 24)
        }
      }
    }
  }
}

module.exports = OtgwService
