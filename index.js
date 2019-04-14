// homebridge-otgw/index.js
// Copyright © 2019 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const OtgwPlatform = require('./lib/OtgwPlatform')
const packageJson = require('./package.json')

module.exports = function (homebridge) {
  OtgwPlatform.loadPlatform(homebridge, packageJson, 'OTGW', OtgwPlatform)
}
