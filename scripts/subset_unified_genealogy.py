"""Cut a small, real ARG out of the unified genealogy for the JBrowse demo.

Source: Wohns et al. 2022, "A unified genealogy of modern and ancient genomes"
(Zenodo 5512994), chr20 short arm, GRCh38, dated with tsdate.

Keeps a 1 Mb window around PRNP and a handful of haplotypes per 1000 Genomes
population plus two archaic genomes, then restores chr20's full length so the
coordinates line up with the browser's hg38 chr20 and the untouched rest of the
chromosome reads as "no genealogy here" rather than as empty trees.
"""
import json
import tskit
import tszip

CHR20_LEN = 64_444_167
START, END = 4_200_000, 5_200_000
ARCHAIC = ["Vindija", "Denisovan"]

# Exactly the individuals the paired variant track carries, so a clade in the
# tree and a column block in the genotype matrix are the same haplotypes.
WANTED = set(open("vcf_samples.txt").read().split())

ts = tszip.decompress("chr20p.trees.tsz")

def md(x):
    m = x.metadata
    if isinstance(m, bytes):
        try:
            return json.loads(m.decode())
        except Exception:
            return {}
    return m

pop_name = {p.id: md(p).get("name") for p in ts.populations()}

chosen, labels = [], []
by_pop = {}
for ind in ts.individuals():
    if len(ind.nodes) == 0:
        continue
    name = pop_name.get(ts.node(ind.nodes[0]).population)
    by_pop.setdefault(name, []).append(ind)

for ind in ts.individuals():
    if len(ind.nodes) == 0:
        continue
    iid = md(ind).get("individual_id")
    if iid in WANTED:
        chosen.extend(ind.nodes)
        labels.append((pop_name.get(ts.node(ind.nodes[0]).population), iid))
for pop in ARCHAIC:
    for ind in sorted(by_pop.get(pop, []), key=lambda i: i.id)[:1]:
        chosen.extend(ind.nodes)
        labels.append((pop, md(ind).get("name") or pop))

print(f"{len(labels)} individuals, {len(chosen)} haplotypes")
sub = ts.simplify(samples=chosen, filter_populations=False, filter_individuals=False)
sub = sub.keep_intervals([[START, END]], simplify=False)
sub = sub.simplify(filter_populations=False, filter_individuals=False)

t = sub.dump_tables()
t.sequence_length = CHR20_LEN
t.sort()
t.build_index()
out = t.tree_sequence()
out.dump("prnp_real.trees")

print("trees", out.num_trees, "nodes", out.num_nodes, "edges", out.num_edges,
      "samples", out.num_samples, "seqlen", int(out.sequence_length))
tr = out.at(4_690_000)
print("PRNP tree", tr.interval, "roots", tr.num_roots,
      "tmrca", max(out.node(r).time for r in tr.roots))
with open("prnp_samples.json", "w") as fh:
    json.dump([{"population": p, "id": i} for p, i in labels], fh, indent=1)
