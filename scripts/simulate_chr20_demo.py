import msprime, tskit

CHR20_LEN = 64444167          # hg38 chr20
START, END = 1_000_000, 11_000_000

ts = msprime.sim_ancestry(
    samples=25, sequence_length=END - START,
    recombination_rate=1e-8, population_size=10_000, random_seed=42)

t = ts.dump_tables()
t.sequence_length = CHR20_LEN
e = t.edges.copy()
t.edges.clear()
t.edges.set_columns(left=e.left + START, right=e.right + START,
                    parent=e.parent, child=e.child)
t.sort()
t.build_index()
out = t.tree_sequence()
out.dump("chr20_sim.trees")
print("trees", out.num_trees, "nodes", out.num_nodes, "edges", out.num_edges,
      "samples", out.num_samples, "seqlen", out.sequence_length)
first = out.first()
print("tree0 interval", first.interval, "roots", first.num_roots)
mid = out.at(2_000_000)
print("mid interval", mid.interval, "roots", mid.num_roots)
