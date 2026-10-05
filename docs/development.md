# Development

## Development

```bash
pnpm install
pnpm test          # tskit parsing and packing, checked against tskit's own output
pnpm run build     # esm/ and a UMD bundle for the plugin loader
```

`test_data/` holds a 20-sample, 100kb msprime simulation (1144 local trees), a
matching 100kb assembly, and a `config.json` that wires them together — the
offline fixture, unrelated to the deployed demos. To see it:

```bash
pnpm run build
# serve the plugin bundle, the config and the data from one origin, then
npx @jbrowse/capture --instance http://localhost:8899 \
  --config http://localhost:8899/config.json \
  --assembly sim --loc chr1:1-600 --track sim_arg -o arg.png
```

## Publishing the demo

`pnpm betabuild` gates on typecheck, tests and build, uploads the bundle to
`demos/arg/<hash>/` (immutable) and `demos/arg/` (60-second cache), invalidates
CloudFront, and then reads back what the CDN actually serves and compares
digests — the failure it exists to catch is a demo config naming a URL that 404s
or serves yesterday's bundle. The demo config itself lives in the
jbrowse-components repo at `demos/arg/config.json` and deploys with
`scripts/deploy-demo.sh arg/config.json`; `scripts/simulate_chr20_demo.py` here
regenerates the tree sequence behind it.

## Correctness

The `.trees` reader is checked against tskit itself, not against its own output.
`test/treeSequence.test.ts` pins table shapes, the tree count, and — at five
positions across the sequence — the tree index, interval, root and parent array
that `ts.at(pos)` gives in Python, plus a full 1144-tree walk and the region
packer's edge counts and TMRCA values.

Seeking is what makes this usable on a large file: tskit stores edge insertion
and removal orders, sorted by left and by right coordinate, so two binary
searches bound the edges active at a position and the tree is built directly
rather than by replaying every breakpoint before it.

## Limits

- **The whole file is downloaded.** `.trees` has no genomic index — the format
  is one flat store of columns — so there is nothing to range-request against.
  Fine for simulations and chromosome-scale files; not for biobank-scale ones,
  which is the problem lorax's backend exists to solve.
- **`.trees.tsz` (tszip) is not supported.** Detected and reported, not
  decompressed. Run `tsunzip` first.
- **A mutation above a tree's root is not drawn.** It has no branch to sit on.
- **Canvas2D only.** Well inside the threshold where a GPU path would earn its
  keep (~100K features/frame); the edge budget keeps a frame under that.

## Reproducing the figures

`figures.mjs` renders every image in this README and in `docs/`; name some to
render only those. It serves `dist/` on localhost as the plugin, alongside the
simulated data and the hosted demo config rewritten to load that build, and
opens each view in headless Chrome. It waits for `@jbrowse/capture` to report
the tracks drawn, and fails if any track shows an error. It then draws the
callouts at genomic positions and times read from the live view.
