import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/index.js',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  banner: {
    js: [
      "import { createRequire as __dshMemoryHubCreateRequire } from 'node:module'",
      'const require = __dshMemoryHubCreateRequire(import.meta.url)',
      `// dsh-memory-hub ${packageJson.version}`,
    ].join('\n'),
  },
})
