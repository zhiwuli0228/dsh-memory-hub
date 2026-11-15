import packageJson from '../package.json' with { type: 'json' }

/** 单一版本来源：package.json。MCP serverInfo 与 CLI 共用。 */
export const PACKAGE_VERSION: string = packageJson.version
