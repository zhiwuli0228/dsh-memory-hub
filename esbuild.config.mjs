import { build } from 'esbuild'

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
      '// dsh-memory-hub 0.1.0',
    ].join('\n'),
  },
})
