# Introgression and the ancestry painting

![An ancestry painting: one row per haplotype, and A6's row turns population B's color over a stretch where it carries DNA from B](../img/introgression.png)

Here two simulated populations split 20,000 generations ago, and 500 generations
ago population A took in 3% of its DNA from B. The painting has one row per
haplotype, and colors each local tree's stretch of a row by the population that
haplotype's nearest relatives belong to. Nearest relatives here means the other
samples in the first clade it joins.

Everywhere but one stretch, every A haplotype's closest relatives are A and
every B haplotype's are B. Over about 180 kb, A6's row turns B's color. That is
DNA A6 inherited from the pulse, and its length is set by how long ago the pulse
was: recombination has had 500 generations to cut it down. The same stretch
lights up B6 and B3 in A's color. That is the other side of the same event:
their closest relative there is A6's imported copy, and A6 is an A haplotype.

[Open the painting above the local trees of the same file][sim-introgression].

[sim-introgression]:
  https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farg%2Fconfig.json&assembly=sim&loc=chr1%3A1-1%2C200%2C000&tracks=sim_introgression_painting%2Csim_introgression

Drawn as trees, the same file puts A6 at the edge between the blue and orange
clades in every tree, where the eye cannot find it. As a painting, it is one row
changing color.

```bash
uv run --with msprime==1.4.4 python scripts/figures/simulate_introgression.py
node scripts/figures/figures.mjs introgression
```

## The painting is a feature track

The plugin does not draw the painting itself. `ArgAdapter` also serves it as
features: one per run of trees in which a sample's nearest relatives stay the
same population at the same share. Each feature carries `row`, `sample`,
`population`, `relatives`, `share` and a `color`. JBrowse's own
`LinearMultiRowFeatureDisplay` draws those rows, so row labels, grouping,
clustering, the legend, tooltips and SVG export come from core:

```json
{
  "type": "FeatureTrack",
  "trackId": "my_painting",
  "name": "Ancestry painting",
  "assemblyNames": ["hg38"],
  "adapter": {
    "type": "ArgAdapter",
    "treesLocation": { "uri": "my.trees", "locationType": "UriLocation" },
    "refName": "chr1"
  },
  "displays": [
    {
      "type": "LinearMultiRowFeatureDisplay",
      "displayId": "my_painting-LinearMultiRowFeatureDisplay",
      "partitionField": "row",
      "color": "jexl:get(feature,'color')"
    }
  ]
}
```

`row` is the sample's own population followed by its name, so a `rowGroups`
entry matching `^YRI ` groups and tints that population's rows. That display
counts at most 200 distinct rows, which bounds the sample count a painting can
show.
