import { getMacroDefines } from './scripts/defines.ts'
import { DEFAULT_BUILD_FEATURES } from './scripts/defines.ts'

const outdir = 'target'

// Collect FEATURE_* env vars → Bun.build features
const envFeatures = Object.keys(process.env)
  .filter(k => k.startsWith('FEATURE_'))
  .map(k => k.replace('FEATURE_', ''))
const features = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]

// Step 2: Bundle with splitting
const result = await Bun.build({
  entrypoints: ['src/entrypoints/cli.tsx'],
  outdir: outdir,
  compile: {
    // other target see: https://bun.com/docs/bundler/executables
    target: 'bun-linux-x64',
    outfile: 'ccb',
  },
  target: 'bun',
  define: {
    ...getMacroDefines(),
    // React production mode — eliminates _debugStack Error objects
    // (6,889 objects × ~1.7KB = 12MB in development builds) and removes
    // prop-type / key warnings not useful in a production CLI tool.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  features,
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}
