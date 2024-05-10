// homebridge-otgw/lib/OtgwMessageParser.js
// Copyright © 2019-2024 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

import { EventEmitter } from 'node:events'

// Check parity of 32-bit OpenTherm message
function checkParity (n) {
  let parity = 0
  for (let bit = 0; bit < 32; bit++) {
    if ((n & (1 << bit)) !== 0) {
      parity = 1 - parity
    }
  }
  return parity === 0
}

// OpenTherm message types.
const messageTypes = Object.freeze({
  READ_DATA: 0,
  WRITE_DATA: 1,
  INVALID_DATA: 2,
  READ_ACK: 4,
  WRITE_ACK: 5,
  DATA_INVALID: 6,
  UNKNOWN_DATAID: 7
})
const messageTypeDescriptions = Object.freeze([
  'Read-Data', 'Write-Data', 'Invalid-Data', null,
  'Read-Ack', 'Write-Ack', 'Data-Invalid', 'Unknown-DataId'
])

// Conversion functions for OpenTherm Data Values
function bit (v, b) { return (v & (0x01 << b)) !== 0 }
function u8 (v) { return parseInt(v, 16) }
function u8hi (v) { return u8(v.slice(0, 2)) }
function u8lo (v) { return u8(v.slice(2, 4)) }
function s8 (v) {
  v = parseInt(v, 16)
  return (v & 0x80) === 0 ? v : v - 0x100
}
function s8hi (v) { return s8(v.slice(0, 2)) }
function s8lo (v) { return s8(v.slice(2, 4)) }
function u16 (v) { return parseInt(v, 16) }
function s16 (v) {
  v = parseInt(v, 16)
  return (v & 0x8000) === 0 ? v : v - 0x10000
}
function f88 (v) {
  v = parseInt(v, 16)
  return Math.round(((v & 0x8000) === 0 ? v : v - 0x10000) / 2.56) / 100
}

// OpenTherm v2.2 Data IDs.
const dataIds = Object.freeze({
  // class 1 - Control and Status Information
  '00': [
    { key: 'master_status_ch_enable', f: (v) => { return bit(u8hi(v), 0) } },
    { key: 'master_status_dhw_enable', f: (v) => { return bit(u8hi(v), 1) } },
    // { key: 'master_status_cooling_enable', f: (v) => { return bit(u8hi(v), 2) } },
    // { key: 'master_status_otc_active', f: (v) => { return bit(u8hi(v), 3) } },
    // { key: 'master_status_ch2_enable', f: (v) => { return bit(u8hi(v), 4) } },
    { key: 'slave_status_fault', f: (v) => { return bit(u8lo(v), 0) } },
    { key: 'slave_status_ch_mode', f: (v) => { return bit(u8lo(v), 1) } },
    { key: 'slave_status_dhw_mode', f: (v) => { return bit(u8lo(v), 2) } },
    { key: 'slave_status_flame_status', f: (v) => { return bit(u8lo(v), 3) } },
    // { key: 'slave_status_cooling_status', f: (v) => { return bit(u8lo(v), 4) } },
    // { key: 'slave_status_ch2_mode', f: (v) => { return bit(u8lo(v), 5) } },
    { key: 'slave_status_diagnostic_indication', f: (v) => { return bit(u8lo(v), 6) } }
  ],
  '01': [{ key: 'control_setpoint', f: f88 }],
  '05': [
    { key: 'application_flags_service_request', f: (v) => { return bit(u8hi(v), 0) } },
    { key: 'application_flags_lockout_reset', f: (v) => { return bit(u8hi(v), 1) } },
    { key: 'application_flags_low_water_pressure', f: (v) => { return bit(u8hi(v), 2) } },
    { key: 'application_flags_flame_fault', f: (v) => { return bit(u8hi(v), 3) } },
    { key: 'application_flags_air_pressure_fault', f: (v) => { return bit(u8hi(v), 4) } },
    { key: 'application_flags_water_over_temperature', f: (v) => { return bit(u8hi(v), 5) } },
    { key: 'oem_fault_code', f: u8lo }
  ],
  '08': [{ key: 'control_setpoint2', f: f88 }],
  73: [{ key: 'oem_diagnostic_code', f: u16 }],

  // class 2 - Configuration Information
  '02': [{ key: 'master_memberid', f: u8lo }],
  '03': [
    { key: 'slave_configuration_dwh_present', f: (v) => { return bit(u8hi(v), 0) } },
    { key: 'slave_configuration_control_type_onoff', f: (v) => { return bit(u8hi(v), 1) } },
    { key: 'slave_configuration_cooling_config', f: (v) => { return bit(u8hi(v), 2) } },
    { key: 'slave_configuration_dwh_config', f: (v) => { return bit(u8hi(v), 3) } },
    { key: 'slave_configuration_master_control_disallowed', f: (v) => { return bit(u8hi(v), 4) } },
    { key: 'slave_configuration_ch2_present', f: (v) => { return bit(u8hi(v), 5) } },
    { key: 'slave_memberid', f: u8lo }
  ],
  '7C': [{ key: 'master_opentherm_version', f: f88 }],
  '7D': [{ key: 'slave_opentherm_version', f: f88 }],
  '7E': [
    { key: 'master_product_type', f: u8hi },
    { key: 'master_product_version', f: u8lo }
  ],
  '7F': [
    { key: 'slave_product_type', f: u8hi },
    { key: 'slave_product_version', f: u8lo }
  ],

  // class 3 - Remote Commands
  '04': [
    { key: 'command_code', f: u8hi },
    { key: 'command_response_code', f: u8lo }
  ],

  // class 4 - Sensor and Informational Data
  10: [{ key: 'room_setpoint', f: f88 }],
  11: [{ key: 'relative_modulation_level', f: f88 }],
  12: [{ key: 'ch_water_pressure', f: f88 }],
  13: [{ key: 'dhw_flow_rate', f: f88 }],
  14: [
    { key: 'weekday', f: (v) => { return (u8hi(v) & 0xE0) >> 5 } },
    { key: 'hour', f: (v) => { return u8hi(v) & 0x1F } },
    { key: 'minute', f: u8lo }
  ],
  15: [
    { key: 'month', f: u8hi },
    { key: 'day', f: u8lo }
  ],
  16: [{ key: 'year', f: u16 }],
  17: [{ key: 'room_setpoint2', f: f88 }],
  18: [{ key: 'room_temperature', f: f88 }],
  19: [{ key: 'boiler_water_temperature', f: f88 }],
  '1A': [{ key: 'dhw_temperature', f: f88 }],
  '1B': [{ key: 'outside_temperature', f: f88 }],
  '1C': [{ key: 'return_water_temperature', f: f88 }],
  '1D': [{ key: 'solar_storage_temperature', f: f88 }],
  '1E': [{ key: 'solar_collector_temperature', f: s16 }],
  '1F': [{ key: 'flow_temperature_ch2', f: f88 }],
  20: [{ key: 'dwh2_temperature', f: f88 }],
  21: [{ key: 'exhaust_temperature', f: s16 }],
  74: [{ key: 'burner_starts', f: u16 }],
  75: [{ key: 'ch_pump_starts', f: u16 }],
  76: [{ key: 'dhw_pump_starts', f: u16 }],
  77: [{ key: 'dhw_burner_starts', f: u16 }],
  78: [{ key: 'burner_operation_hours', f: u16 }],
  79: [{ key: 'ch_pump_operation_hours', f: u16 }],
  '7A': [{ key: 'dhw_pump_operation_hours', f: u16 }],
  '7B': [{ key: 'dhw_burner_operation_hours', f: u16 }],

  // class 5 - Pre-Definied Remote Boiler Parameters
  '06': [
    { key: 'remote_parameter_enable_dwh_setpoint', f: (v) => { return bit(u8hi(v), 0) } },
    { key: 'remote_parameter_enable_max_ch_setpoint', f: (v) => { return bit(u8hi(v), 1) } },
    { key: 'remote_parameter_write_dwh_setpoint', f: (v) => { return bit(u8lo(v), 0) } },
    { key: 'remote_parameter_write_max_ch_setpoint', f: (v) => { return bit(u8lo(v), 1) } }
  ],
  30: [
    { key: 'dhw_setpoint_max', f: s8hi },
    { key: 'dhw_setpoint_min', f: s8lo }
  ],
  31: [
    { key: 'max_ch_setpoint_max', f: s8hi },
    { key: 'max_ch_setpoint_min', f: s8lo }
  ],
  38: [{ key: 'dhw_setpoint', f: f88 }],
  39: [{ key: 'max_ch_setpoint', f: f88 }],

  // Class 6 - Transparent Slave Parameters
  '0A': [{ key: 'tsp_number', f: u8hi }],
  '0B': [
    { key: 'tsp_index', f: u8hi },
    { key: 'tsp_value', f: u8lo }
  ],

  // Class 7 - Fault History Data
  '0C': [{ key: 'fault_buffer_size', f: u8hi }],
  '0D': [
    { key: 'fault_index', f: u8hi },
    { key: 'fault_value', f: u8lo }
  ],

  // Class 8 - Control o Special Applications
  '07': [{ key: 'cooling_control', f: f88 }],
  '0E': [{ key: 'max_relative_modulation_setting', f: f88 }],
  '0F': [
    { key: 'max_boiler_capacity', f: u8hi },
    { key: 'min_modulation_level', f: u8lo }
  ],
  '09': [{ key: 'room_setpoint_remote_override', f: f88 }],
  64: [
    { key: 'remote_override_manual_change_priority', f: (v) => { return bit(u8lo(v), 0) } },
    { key: 'remote_override_programme_change_priority', f: (v) => { return bit(u8lo(v), 1) } }
  ]
})

// Conversion functions for summary message values.
function hex (n) {
  return ('0000' + Number(n).toString(16).toUpperCase()).slice(-4)
}
function twoBytes (v) {
  const a = v.split('/')
  return hex((Number(a[0]) << 8) + Number(a[1]))
}
function twoBitFields (v) {
  const a = v.split('/').map((v) => { return parseInt(v, 2) })
  return hex((Number(a[0]) << 8) + Number(a[1]))
}

// Data IDs included in the summary message.
const summary = Object.freeze([
  { id: '00', f: twoBitFields },
  { id: '01' },
  { id: '06', f: twoBitFields },
  { id: '07' },
  { id: '08' },
  { id: '0E' },
  { id: '0F', f: twoBytes },
  { id: '10' },
  { id: '11' },
  { id: '12' },
  { id: '13' },
  { id: '17' },
  { id: '18' },
  { id: '19' },
  { id: '1A' },
  { id: '1B' },
  { id: '1C' },
  { id: '1F' },
  { id: '21' },
  { id: '30', f: twoBytes },
  { id: '31', f: twoBytes },
  { id: '38' },
  { id: '39' },
  { id: '46', f: twoBitFields },
  { id: '47' },
  { id: '4D' },
  { id: '74' },
  { id: '75' },
  { id: '76' },
  { id: '77' },
  { id: '78' },
  { id: '79' },
  { id: '7A' },
  { id: '7B' }
])

// Class to parse OpenTherm Gateway messages.
class OtgwMessageParser extends EventEmitter {
  get messageTypes () { return messageTypes }

  isOtMessage (s) {
    if (typeof s !== 'string') {
      return false
    }
    return /^[TBRA][0-9A-F]0[0-9A-F]{6}/.test(s)
  }

  isSummary (s) {
    if (typeof s !== 'string') {
      return false
    }
    return s.split(',').length === summary.length
  }

  parseOtMessage (s) {
    if (typeof s !== 'string') {
      throw new TypeError(`${s}: invalid string`)
    }
    const a = s.match(/^([TBRA])([0-9A-F]0[0-9A-F]{2}[0-9A-F]{4})/)
    if (a == null) {
      throw new RangeError(`${s}: invalid OpenTherm message`)
    }
    const message = a[0]
    const origin = a[1]
    if (!checkParity(parseInt(a[2], 16))) {
      this.emit('error', `${message}: parity error`)
      return null
    }
    const type = parseInt(a[2].slice(0, 1), 16) & 0x7
    if (messageTypeDescriptions[type] == null) {
      this.emit('error', `${message}: invalid OpenTherm message type`)
      return null
    }
    if (
      ((origin === 'T' || origin === 'R') && (type & 0x04) !== 0) ||
      ((origin === 'B' || origin === 'A') && (type & 0x04) === 0)
    ) {
      this.emit('error', `${a[0]}: origin / message type mismatch`)
      return null
    }
    const id = a[2].slice(2, 4)
    const value = a[2].slice(4, 8)
    const body = {}
    const definitions = dataIds[id] || []
    for (const definition of definitions) {
      body[definition.key] = definition.f(value)
    }
    return { message, origin, type, id, value, body }
  }

  parseSummary (s) {
    if (typeof s !== 'string') {
      throw new TypeError(`${s}: invalid string`)
    }
    const a = s.split(',')
    if (a.length !== summary.length) {
      throw new RangeError(`${s}: invalid summary message`)
    }
    const body = {}
    for (const i in summary) {
      const definitions = dataIds[summary[i].id] || []
      for (const definition of definitions) {
        body[definition.key] = summary[i].f == null
          ? Number(a[i])
          : definition.f(summary[i].f(a[i]))
      }
    }
    return body
  }
}

export { OtgwMessageParser }
