// homebridge-otgw/lib/OtgwClient.js
// Copyright © 2019 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('homebridge-lib')

let boilerBoundaries
let hotWaterBoundaries

class OtgwService extends homebridgeLib.ServiceDelegate {
  static setBoilerBoundaries (boundaries) {
    boilerBoundaries = boundaries
  }

  static setHotWaterBoundaries (boundaries) {
    hotWaterBoundaries = boundaries
  }

  constructor (otgwAccessory, params = {}) {
    params.name = otgwAccessory.name
    params.Service = otgwAccessory.Services.eve.Thermostat
    super(otgwAccessory, params)
  }

  static get Thermostat () {
    return class Thermostat extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            validValues: [
              this.Characteristics.hap.TargetHeatingCoolingState.HEAT,
              this.Characteristics.hap.TargetHeatingCoolingState.AUTO
            ]
          },
          setter: this.onSetTargetState.bind(this)
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
          props: { minStep: 1 },
          setter: this.onSetTargetTemperature.bind(this)
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
        // }).on('didSet', (value) => {
        //   this.values.programData = value
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
      }

      checkState (state) {
        let updated = false
        if (state.room_setpoint_remote_override != null) {
          this.context.override = state.room_setpoint_remote_override > 0
          if (this.context.override) {
            this.values.targetTemperature =
              Math.round(state.room_setpoint_remote_override * 10) / 10
          }
          updated = true
        }
        if (state.slave_status_ch_mode != null) {
          this.values.state = state.slave_status_ch_mode
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          updated = true
        }
        if (state.master_status_ch_enable != null) {
          this.values.targetState = this.context.override
            ? this.Characteristics.hap.TargetHeatingCoolingState.HEAT
            : this.Characteristics.hap.TargetHeatingCoolingState.AUTO
        }
        if (state.room_temperature != null) {
          this.values.temperature = Math.round(state.room_temperature * 10) / 10
          updated = true
        }
        if (state.room_setpoint != null && !this.context.override) {
          this.values.targetTemperature = Math.round(state.room_setpoint * 10) / 10
          updated = true
        }
        if (state.max_reletive_modulation_setting != null) {
          this.values.valvePosition = state.max_reletive_modulation_setting
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).substr(0, 24)
        }
      }

      async onSetTargetState (value) {
        if (this.platform.client != null) {
          if (value === this.Characteristics.hap.TargetHeatingCoolingState.AUTO) {
            await this.platform.client.command('TT=0')
            this.context.override = false
          }
        }
      }

      async onSetTargetTemperature (value) {
        if (this.platform.client != null) {
          await this.platform.client.command('TT=' + value)
        }
      }
    }
  }

  static get Boiler () {
    return class Boiler extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            validValues: [
              this.Characteristics.hap.TargetHeatingCoolingState.OFF,
              this.Characteristics.hap.TargetHeatingCoolingState.HEAT
            ]
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
          props: boilerBoundaries
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
        // }).on('didSet', (value) => {
        //   this.values.programData = value
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
      }

      checkState (state) {
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
        if (updated) {
          this.values.lastUpdated = String(new Date()).substr(0, 24)
        }
      }
    }
  }

  static get HotWater () {
    return class HotWater extends OtgwService {
      constructor (otgwAccessory, params = {}) {
        super(otgwAccessory, params)
        this.addCharacteristicDelegate({
          key: 'state',
          Characteristic: this.Characteristics.hap.CurrentHeatingCoolingState
        })
        this.addCharacteristicDelegate({
          key: 'targetState',
          Characteristic: this.Characteristics.hap.TargetHeatingCoolingState,
          props: {
            validValues: [
              this.Characteristics.hap.TargetHeatingCoolingState.OFF,
              this.Characteristics.hap.TargetHeatingCoolingState.HEAT,
              this.Characteristics.hap.TargetHeatingCoolingState.AUTO
            ]
          },
          setter: this.onSetTargetState.bind(this)
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
          props: hotWaterBoundaries,
          setter: this.onSetTargetTemperature.bind(this)
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
        // }).on('didSet', (value) => {
        //   this.values.programData = value
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
        this.accessoryDelegate.once('heartbeat', (beat) => {
          this.beat = (beat % 60) + 5
        })
        this.accessoryDelegate.on('heartbeat', this.onHeartbeat.bind(this))
      }

      checkState (state) {
        let updated = false
        if (state.slave_status_dhw_mode != null) {
          this.values.state = state.slave_status_dhw_mode
            ? this.Characteristics.hap.CurrentHeatingCoolingState.HEAT
            : this.Characteristics.hap.CurrentHeatingCoolingState.OFF
          this.values.valvePosition = state.slave_status_dhw_mode ? 100 : 0
          updated = true
        }
        if (state.master_status_dhw_enable != null && !this.waiting) {
          this.values.targetState = this.context.override
            ? state.master_status_dhw_enable
              ? this.Characteristics.hap.TargetHeatingCoolingState.HEAT
              : this.Characteristics.hap.TargetHeatingCoolingState.OFF
            : this.Characteristics.hap.TargetHeatingCoolingState.AUTO
        }
        if (state.boiler_water_temperature != null) {
          this.values.temperature = Math.round(state.boiler_water_temperature * 10) / 10
          updated = true
        }
        if (state.dhw_setpoint != null) {
          this.values.targetTemperature = Math.round(state.dhw_setpoint * 10) / 10
          updated = true
        }
        if (updated) {
          this.values.lastUpdated = String(new Date()).substr(0, 24)
        }
      }

      async onSetTargetState (value) {
        if (this.platform.client != null) {
          let command
          switch (value) {
            case this.Characteristics.hap.TargetHeatingCoolingState.OFF:
              command = 0
              break
            case this.Characteristics.hap.TargetHeatingCoolingState.HEAT:
              command = 1
              break
            case this.Characteristics.hap.TargetHeatingCoolingState.AUTO:
              command = 'A'
              break
          }
          this.waiting = true
          await this.platform.client.command('HW=' + command)
          this.context.override = command !== 'A'
          this.waiting = false
        }
      }

      async onSetTargetTemperature (value) {
        if (this.platform.client != null) {
          this.waitingTargetTemperature = true
          await this.platform.client.command('SW=' + value)
          this.waitingTargetTemperature = false
        }
      }

      async onHeartbeat (beat) {
        if (beat % 60 === this.beat && this.platform.client != null) {
          const hotWater = await this.platform.client.command('PR=W')
          this.context.override = hotWater !== 'W=A'
        }
      }
    }
  }
}

module.exports = OtgwService
