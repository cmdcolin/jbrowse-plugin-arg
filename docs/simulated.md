# The simulated demo

The [main README](../README.md) leads with real inferred human genealogies,
which is the interesting case and also the one with an inference step between
the picture and the truth. This is the control: an msprime coalescent where
every coalescence is one the simulator actually made, so anything the display
gets wrong here is the display's fault.

## What it is

50 haplotypes over 10 Mb, `recombination_rate=1e-8`, `Ne=10000`, seed 42, giving
15,321 local trees. The edge coordinates are then shifted onto **hg38
chr20:1,000,000-11,000,000** and `sequence_length` set to chr20's real length,
so the genealogy sits under the real RefSeq genes and the rest of the
chromosome reads as "no genealogy here". `scripts/simulate_chr20_demo.py`
regenerates it.

It is not a genealogy of real people. The track is named `Simulated ARG
(msprime, 50 haplotypes)` and should keep saying so.

## Live links

| view                        | what it shows                            | open                       |
| --------------------------- | ----------------------------------------- | -------------------------- |
| chr20:1,900,000..1,920,000  | local trees as dendrograms, under SIRPA  | [launch][sim-trees]        |
| chr20:1,850,000..2,050,000  | the same trees, as a TMRCA skyline       | [launch][sim-mixed]        |
| chr20:1,000,000..11,000,000 | all 15,321 local trees as one skyline    | [launch][sim-skyline]      |

[sim-trees]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=hg38&loc=chr20%3A1%2C900%2C000-1%2C920%2C000&tracks=genes%2Cchr20_arg
[sim-mixed]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=hg38&loc=chr20%3A1%2C850%2C000-2%2C050%2C000&tracks=genes%2Cchr20_arg
[sim-skyline]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=hg38&loc=chr20%3A1%2C000%2C000-11%2C000%2C000&tracks=genes%2Cchr20_arg

## Zoomed in

Each local tree as a dendrogram across the interval it spans. The red segments
between them are trees too narrow at this width to separate 50 leaves, so they
show as the height their root coalesces at.

![Local trees of a simulated ARG under the SIRPA gene](../img/trees.png)

## Zoomed out

No tree is wide enough any more, and what is left is the skyline. Same drawing,
not a second view: the red follows exactly the tops of the dendrograms above.

![A TMRCA skyline over 200kb](../img/mixed.png)

## The whole window

15,321 local trees. Where the skyline dips, the 50 sampled lineages find a
common ancestor recently; where it spikes, deeper structure survives.

![A TMRCA skyline over the whole 10Mb window](../img/skyline.png)
