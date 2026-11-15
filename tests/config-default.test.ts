/**
 * 默认配置模板（`DEFAULT_CONFIG_YAML`）本身的回归。
 *
 * 这份字符串会被写进**每一个新用户的 Hub 根**，但之前没有任何测试覆盖它：
 * 它一旦语法错、字段名写错、或与 `configSchema` 漂移，用户第一次打开插件
 * 就会看到一份读不懂的配置文件。引入 remote 段时我就在这里踩过一次
 * （模板里用了反引号，把整个 TS 模板字符串提前终止了）。
 */

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { DEFAULT_CONFIG_YAML, configSchema } from '../src/config.js'
import { normalizeRemoteSettings, validateRemoteSettings } from '../src/remote/registry.js'

describe('default config template', () => {
  it('is valid YAML', () => {
    expect(() => parseYaml(DEFAULT_CONFIG_YAML)).not.toThrow()
  })

  it('parses into the config schema without errors', () => {
    const raw = parseYaml(DEFAULT_CONFIG_YAML) as unknown
    const result = configSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })

  it('keeps remote off by default and still desugars the tencent section', () => {
    const config = configSchema.parse(parseYaml(DEFAULT_CONFIG_YAML))
    const settings = normalizeRemoteSettings({ remote: config.remote, tencent: config.tencent })
    // 默认关闭 → 零网络。
    expect(settings.enabled).toBe(false)
    // 但旧的 tencent: 段仍在模板里 → 必须被 desugar 出来（enabled:false）。
    expect(settings.providers).toHaveLength(1)
    expect(settings.providers[0]!.id).toBe('tencent')
    expect(settings.providers[0]!.roles).toEqual(['feed', 'mirror'])
    expect(settings.providers[0]!.enabled).toBe(false)
    // 默认配置必须自身通过角色校验，否则用户照抄模板就报错。
    expect(validateRemoteSettings(settings)).toEqual({ ok: true, errors: [] })
  })

  it('flips remote on together with the tencent bridge when enabled is set', () => {
    const raw = parseYaml(DEFAULT_CONFIG_YAML) as Record<string, unknown>
    const tencent = { ...(raw.tencent as Record<string, unknown>), enabled: true }
    const config = configSchema.parse({ ...raw, tencent })
    const settings = normalizeRemoteSettings({ remote: config.remote, tencent: config.tencent })
    expect(settings.enabled).toBe(true)
    expect(settings.mode).toBe('local-first')
  })
})
