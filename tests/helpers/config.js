import { createConfig, ENV } from '../../src/config/env.js'

export const overrideConfig = override => createConfig(ENV.MAINNET, override)
export const config = overrideConfig({})
