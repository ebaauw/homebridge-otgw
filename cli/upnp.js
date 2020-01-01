#!/usr/bin/env node

// homebridge-otgw/cli/upnp.js
// Copyright © 2019-2020 Erik Baauw. All rights reserved.
//
// Homebridege plugin for OpenTherm Gateway.

'use strict'

const homebridgeLib = require('homebridge-lib')

new homebridgeLib.UpnpCommand().main()
