import type { Context } from './host.js'
import { MemoryRuntime } from './runtime.js'

export const name = 'dsh-memory-hub'
export const inject = ['tools']

/**
 * Cordis entry point. Initialization is asynchronous; tools and hooks are
 * registered synchronously and await `runtime.ready` inside their bodies, so a
 * failed mount never throws into the host loader.
 */
export function apply(ctx: Context, config?: unknown): void {
  const runtime = new MemoryRuntime(ctx, config)
  try {
    runtime.register()
  } catch (error) {
    ctx.logger?.warn(`dsh-memory-hub: registration failed: ${(error as Error).message}`)
    return
  }
  try {
    ctx.effect(() => {
      void runtime.start()
      return () => {
        void runtime.dispose()
      }
    }, 'dsh-memory-hub')
  } catch (error) {
    ctx.logger?.warn(`dsh-memory-hub: lifecycle registration failed: ${(error as Error).message}`)
  }
}
