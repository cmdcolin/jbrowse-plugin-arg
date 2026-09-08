#!/usr/bin/env node
/**
 * Publish the plugin bundle so a stock JBrowse can load it by URL.
 *
 * Two copies of the same build, the split alphagenome's publisher uses for the
 * same reason: `<hash>/` is immutable and is what anything that must not change
 * under it — the demo config, a screenshot fixture — names, while the
 * unversioned copy has a short cache life and is what a reader following the
 * README installs, because they want the build the README just described.
 *
 * It reads back what the CDN actually serves rather than trusting the upload,
 * since the failure being avoided is a config naming a URL that 404s or serves
 * yesterday's bundle.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUCKET = 's3://jbrowse.org/demos/arg'
const PUBLIC = 'https://jbrowse.org/demos/arg'
const DISTRIBUTION = 'E13LGELJOT4GQO'
const BUNDLE = 'jbrowse-plugin-arg.umd.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')

function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, AWS_PAGER: '' },
  })
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

run('pnpm', ['run', 'typecheck'])
run('pnpm', ['run', 'test'])
run('pnpm', ['run', 'build'])

const bundle = readFileSync(join(root, 'dist', BUNDLE))
const digest = sha256(bundle)
const shortDigest = digest.slice(0, 12)

if (dryRun) {
  console.log(`\nwould publish ${BUNDLE} (${bundle.length} bytes)`)
  console.log(`  ${PUBLIC}/${shortDigest}/${BUNDLE}`)
  console.log(`  ${PUBLIC}/${BUNDLE}`)
  process.exit(0)
}

run('aws', [
  's3',
  'sync',
  'dist',
  `${BUCKET}/${shortDigest}/`,
  '--cache-control',
  'public, max-age=31536000, immutable',
])
run('aws', [
  's3',
  'sync',
  'dist',
  `${BUCKET}/`,
  '--cache-control',
  'public, max-age=60',
])
run('aws', [
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  DISTRIBUTION,
  '--paths',
  `/demos/arg/${BUNDLE}`,
])

for (const url of [`${PUBLIC}/${shortDigest}/${BUNDLE}`, `${PUBLIC}/${BUNDLE}`]) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  const served = sha256(Buffer.from(await response.arrayBuffer()))
  if (served !== digest) {
    throw new Error(
      `${url} serves ${served.slice(0, 12)}, expected ${shortDigest}`,
    )
  }
  console.log(`verified ${url}`)
}

console.log(`
Pinned:      ${PUBLIC}/${shortDigest}/${BUNDLE}
Unversioned: ${PUBLIC}/${BUNDLE}`)
