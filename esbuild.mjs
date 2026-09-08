import fs from 'node:fs'

import { globalExternals } from '@fal-works/esbuild-plugin-global-externals'
import JBrowseReExports from '@jbrowse/core/ReExports/list'
import * as esbuild from 'esbuild'
import prettyBytes from 'pretty-bytes'

/**
 * The UMD bundle JBrowse's plugin loader fetches.
 *
 * `PluginLoader` reads the plugin off the global as `JBrowsePlugin<Name>`, so
 * the global name is part of the contract rather than a choice, and everything
 * JBrowse re-exports to plugins is taken at load time out of
 * `globalThis.JBrowseExports` — bundling a second React or a second
 * `@jbrowse/core` would give this plugin its own hooks, its own MobX and its
 * own configuration registry, and nothing would talk to anything.
 *
 * esbuild rather than Rollup for exactly one reason: the shape of that lookup.
 * Rollup's UMD output can only reach a global through a dotted path, so a key
 * with a slash in it — every `@jbrowse/core` subpath — comes out as the single
 * property `globalThis['JBrowseExports["@jbrowse/core/configuration"]']`, which
 * is undefined, and the plugin throws on its first import with nothing to say
 * why. `globalExternals` emits the subscript form.
 *
 * The external list is `@jbrowse/core/ReExports/list` itself rather than a copy
 * of it, so a host that starts or stops re-exporting a module changes what this
 * bundles by being upgraded.
 */
function globalMap(names) {
  return Object.fromEntries(
    names.map(name => [
      name,
      { varName: `JBrowseExports[${JSON.stringify(name)}]`, type: 'cjs' },
    ]),
  )
}

// `@jbrowse/core/util/stopToken` is deliberately absent from the list above,
// and so bundled: it is not on the re-export surface, so there is nothing to
// resolve it against at load time. This copy keeps its own token registry, so
// in a UMD build a cancelled fetch runs to completion and has its result
// discarded rather than being aborted at the socket. Every other way of
// consuming this plugin — the ESM entry, which is what an embedded host or a
// bundled app uses — resolves the host's copy and cancels properly.
const result = await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  globalName: 'JBrowsePluginArg',
  outfile: 'dist/jbrowse-plugin-arg.umd.js',
  format: 'iife',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  metafile: true,
  plugins: [
    globalExternals({
      ...globalMap(JBrowseReExports),
      // JBrowse publishes its fork under the upstream name, for the sake of
      // plugins written before the fork existed.
      '@jbrowse/mobx-state-tree': {
        varName: 'JBrowseExports["mobx-state-tree"]',
        type: 'cjs',
      },
    }),
  ],
})

for (const [file, { bytes }] of Object.entries(result.metafile.outputs)) {
  console.log(`Wrote ${prettyBytes(bytes)} to ${file}`)
}
fs.writeFileSync('meta.json', JSON.stringify(result.metafile))
