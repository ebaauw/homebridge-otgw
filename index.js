// homebridge-otgw/index.js
// Copyright © 2019-2024 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

import { createRequire } from 'node:module'

import { OtgwPlatform } from './lib/OtgwPlatform.js'

const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

function main (homebridge) {
  OtgwPlatform.loadPlatform(homebridge, packageJson, 'OTGW', OtgwPlatform)
}

export { main as default }
