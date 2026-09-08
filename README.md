# jbrowse-plugin-arg

Ancestral recombination graphs in JBrowse 2. Reads a [tskit](https://tskit.dev)
tree sequence (`.trees`) and draws its local trees along the genome: **x is
genomic position, y is node time**.

![An inferred human ARG at PRNP, colored by population, above the genotypes of the same haplotypes](img/prnp.png)

Inspired by [lorax](https://github.com/pratikkatte/lorax), which embeds JBrowse
beside its own ARG viewer. This inverts that — the ARG is a JBrowse display, so
it pans and zooms with the rest of the browser and sits in a track stack next to
genes, variants and coverage.

There is no server. The `.trees` format is a flat key-value store of columnar
arrays ([kastore](https://github.com/tskit-dev/kastore)), and this plugin parses
it in the browser, so a file behind any static URL works.

## Live demos

Nothing to install.

**Real data.** An inferred human genealogy at *PRNP* on hg38 chr20 — 23 1000
Genomes individuals across six populations plus a Vindija Neanderthal and a
Denisovan, 50 haplotypes — cut out of the [unified genealogy of modern and
ancient genomes](https://zenodo.org/records/5512994) (Wohns et al. 2022,
`tsinfer` + `tsdate`, GRCh38). Branches are colored by the population every leaf
under them belongs to, and the track below is the 1000 Genomes genotype matrix
for **the same individuals**, so an allele pattern and the clade that carries it
are stacked on one screen.

| view                       | what it shows                                                | open                          |
| -------------------------- | ------------------------------------------------------------ | ----------------------------- |
| chr20:4,689,000..4,693,000 | local trees at PRNP, over the matching genotype matrix       | [launch][arg-demo-prnp]       |
| chr20:4,200,000..5,200,000 | the same 1 Mb as a TMRCA skyline                             | [launch][arg-demo-prnp-wide]  |

**Simulated.** An msprime coalescent, 50 haplotypes over 10 Mb of chr20, useful
because it has no inference in it — every coalescence is one the simulator
actually made.

| view                        | what it shows                                            | open                       |
| --------------------------- | -------------------------------------------------------- | -------------------------- |
| chr20:1,900,000..1,920,000  | local trees as dendrograms, under SIRPA                  | [launch][arg-demo-trees]   |
| chr20:1,000,000..11,000,000 | 15,321 local trees as one skyline                        | [launch][arg-demo-skyline] |

[arg-demo-prnp]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=hg38&loc=chr20%3A4%2C689%2C000-4%2C693%2C000&tracks=genes%2Cprnp_arg%2Cprnp_variants
[arg-demo-prnp-wide]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=hg38&loc=chr20%3A4%2C200%2C000-5%2C200%2C000&tracks=genes%2Cprnp_arg%2Cprnp_variants
[arg-demo-trees]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=hg38&loc=chr20%3A1%2C900%2C000-1%2C920%2C000&tracks=genes%2Cchr20_arg
[arg-demo-skyline]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=hg38&loc=chr20%3A1%2C000%2C000-11%2C000%2C000&tracks=genes%2Cchr20_arg

**The links point at `jb2/main`, not `jb2/latest`, and they have to.** This
plugin composes the v5 display ABI — `MultiRegionDisplayMixin` and
`installUpload` from `@jbrowse/display-kit` and `@jbrowse/render-core` — which
4.3.0, the current stable and what `latest` serves, does not have. On `latest`
the config loads, the other tracks draw, and the ARG track alone shows an error
bar. Point your own deployment at a 5.0.0-beta build.

## What it draws

The picture changes with zoom, without a mode switch. A tree draws its topology
once it has `pxPerLeaf` pixels per sample (2 by default) and collapses to its
TMRCA below that, so dendrograms grow out of the skyline as you zoom in rather
than replacing it.

**Zoomed in** (the picture at the top) — each local tree as a dendrogram, spread
across the interval it spans. Recombination breaks the sequence into trees;
neighbouring ones differ by the subtree a recombination moved. The red segments
between them are the mixture: those trees are too narrow at this width to
separate 50 leaves, so they show as the height their root coalesces at.

**Zoomed out** — no tree is wide enough any more, and what is left is the
skyline. It is the same drawing, not a second view: the red follows exactly the
tops of the dendrograms above.

![A TMRCA skyline over 200kb of chr20](img/mixed.png)

**The whole simulated window** — 15,321 local trees. Where the skyline dips, the
50 sampled lineages find a common ancestor recently; where it spikes, deeper
structure survives at that locus.

![A TMRCA skyline over the whole 10Mb window](img/skyline.png)

## Config

```json
{
  "type": "ArgTrack",
  "trackId": "my_arg",
  "name": "Ancestral recombination graph",
  "assemblyNames": ["sim"],
  "adapter": {
    "type": "ArgAdapter",
    "treesLocation": { "uri": "my.trees", "locationType": "UriLocation" },
    "refName": "chr1"
  }
}
```

`refName` is the assembly sequence the tree sequence's coordinates belong to. A
tree sequence covers one sequence; without this the same ARG would draw on every
chromosome of the assembly.

Display slots: `colorBy` (`population` or `none`), `branchColor`,
`skylineColor`, `gridlineColor`, `timeScale` (`log` or `linear`), `pxPerLeaf`,
`maxEdges`, `maxSkylinePoints`, `height`.

## Coloring by population

`colorBy: population` colors a branch by the population **every** leaf below it
belongs to, and leaves the branches above a join in `branchColor`. So a colored
subtree is a claim — these haplotypes coalesce before they meet anyone else —
and the black above it is where that stops being true. The population comes from
the tree sequence's own population table metadata, so a file with no such
metadata simply draws one color.

The palette is Okabe-Ito, keyed on the populations that actually have samples
rather than on population id: the unified genealogy declares 215 populations and
a 50-haplotype cut carries eight, and keying on the id would hand two of those
eight the same hue for no reason.

## How detail is decided

The display fetches the buffered viewport, so the number of trees in one fetch
already scales with zoom. The worker packs every edge of every tree in that
region unless doing so would exceed `maxEdges` (300k), in which case it sends a
TMRCA skyline binned to `maxSkylinePoints`. Zoom never enters the fetch inputs,
so panning and zooming inside a fetched region repaints without refetching.

Node x positions come back normalized to 0..1 *within each tree's own genomic
interval*, so the renderer needs only that interval's pixel span to place them.
Node times are absolute, and the vertical axis is scaled to the oldest node in
the whole file rather than to what is on screen — the axis does not move as you
pan.

## Development

```bash
pnpm install
pnpm test          # tskit parsing and packing, checked against tskit's own output
pnpm run build     # esm/ and a UMD bundle for the plugin loader
```

`test_data/` holds a 20-sample, 100kb msprime simulation (1144 local trees), a
matching 100kb assembly, and a `config.json` that wires them together. To see it:

```bash
pnpm run build
# serve the plugin bundle, the config and the data from one origin, then
npx @jbrowse/capture --instance http://localhost:8899 \
  --config http://localhost:8899/config.json \
  --assembly sim --loc chr1:1-600 --track sim_arg -o arg.png
```

### Publishing the demo

`pnpm betabuild` gates on typecheck, tests and build, uploads the bundle to
`demos/arg/<hash>/` (immutable) and `demos/arg/` (60-second cache), invalidates
CloudFront, and then reads back what the CDN actually serves and compares
digests — the failure it exists to catch is a demo config naming a URL that
404s or serves yesterday's bundle. The demo config itself lives in the
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
- **No hit-testing yet** — no click or hover on a node or branch.
- **Mutations are not drawn.** The site and mutation tables are parsed and
  available; nothing plots them. This is the gap that would most improve the
  demo above — a mutation drawn on the branch that carries it is the explicit
  link between a clade in the tree and a column in the genotype matrix.
- **Canvas2D only.** Well inside the threshold where a GPU path would earn its
  keep (~100K features/frame); the edge budget keeps a frame under that.
