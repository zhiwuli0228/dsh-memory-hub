import { describe, expect, it } from 'vitest'
import { MEMORY_SKILL, registerMemorySkill } from '../src/skill.js'
import type { Context, SkillRegistrationInput } from '../src/host.js'

const OFFICIAL_SKILL_NAMES = [
  'agent-experience',
  'cordis-composition-reference',
  'cordis-plugin-development',
  'diagnose-windows-sandbox-acl',
  'dsh-env-manager',
  'editing-cordis-compositions',
  'office',
  'office-docx',
  'office-export-pdf',
  'office-pptx',
  'office-recalculate',
  'office-render',
  'office-xlsx',
]

describe('memory-hub skill', () => {
  it('registers a global, model-invocable skill with the core workflow', () => {
    const registered: SkillRegistrationInput[] = []
    const ctx = {
      skills: {
        register(skill: SkillRegistrationInput) {
          registered.push(skill)
          return () => {}
        },
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      get: () => undefined,
    } as unknown as Context

    const dispose = registerMemorySkill(ctx)
    expect(dispose).toBeTypeOf('function')
    expect(registered).toHaveLength(1)
    const skill = registered[0]!
    expect(skill).toMatchObject({
      name: 'memory-hub',
      source: 'runtime',
      invocation: { modelInvocable: true, userInvocable: true },
    })
    expect(skill.description).toContain('DSH Memory Hub')
    expect(skill.content).toContain('memory_get')
    expect(skill.content).toContain('memory_cite')
    expect(skill.content).toContain('memory_close_task')
    expect(skill.content).toContain('memory_maintenance')
    expect(skill.content).toContain('scope: "core"')
    expect(skill.content).toContain('project:<当前工作区>')
    expect(skill.content).toContain('batch:<id>')
  })

  it('degrades safely when the host has no skills service', () => {
    const warnings: string[] = []
    const ctx = {
      logger: { info: () => {}, warn: (message: string) => warnings.push(message), error: () => {} },
      get: () => undefined,
    } as unknown as Context

    expect(registerMemorySkill(ctx)).toBeNull()
    expect(warnings[0]).toContain('skills service unavailable')
  })

  it('keeps the catalog description short and the whenToUse actionable', () => {
    expect(MEMORY_SKILL.description.length).toBeLessThan(300)
    expect(MEMORY_SKILL.whenToUse).toContain('任务结束')
  })

  it('uses a valid, product-owned name that does not reuse a current official skill', () => {
    expect(MEMORY_SKILL.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(OFFICIAL_SKILL_NAMES).not.toContain(MEMORY_SKILL.name)
  })
})
