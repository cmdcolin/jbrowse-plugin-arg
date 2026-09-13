"""Population A takes in 3% of its DNA from B, 500 generations ago.

uv run --with msprime==1.4.4 python scripts/figures/simulate_introgression.py

A and B split 20,000 generations ago, so a haplotype's nearest relatives are its
own population's everywhere except where it carries DNA from the pulse. Seed 154
leaves exactly one such stretch among the 14 samples: A6 over
chr1:544,448-726,806.
"""

import json
from pathlib import Path

import msprime
import tskit

SPLIT = 20_000
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

demography = msprime.Demography()
demography.add_population(name="A", initial_size=1000)
demography.add_population(name="B", initial_size=1000)
demography.add_population(name="ancestral", initial_size=1000)
demography.add_mass_migration(time=500, source="A", dest="B", proportion=0.03)
demography.add_population_split(time=SPLIT, derived=["A", "B"], ancestral="ancestral")
demography.sort_events()

ts = msprime.sim_ancestry(
    samples={"A": 8, "B": 6},
    ploidy=1,
    demography=demography,
    sequence_length=1_200_000,
    recombination_rate=1e-8,
    random_seed=154,
)

tables = ts.dump_tables()
individuals = tables.individuals.copy()
tables.individuals.clear()
tables.individuals.metadata_schema = tskit.MetadataSchema(None)
counts = {}
for row, individual in zip(individuals, ts.individuals()):
    population = ts.population(ts.node(individual.nodes[0]).population).metadata["name"]
    counts[population] = counts.get(population, 0) + 1
    tables.individuals.append(
        row.replace(metadata=json.dumps({"name": f"{population}{counts[population]}"}).encode())
    )
ts = tables.tree_sequence()
ts.dump(OUT / "introgression.trees")

a = [s for s in ts.samples() if ts.node(s).population == 0]
b = [s for s in ts.samples() if ts.node(s).population == 1]
for tree in ts.trees():
    for s in a:
        if any(tree.tmrca(s, t) < SPLIT for t in b):
            name = json.loads(ts.individual(ts.node(s).individual).metadata)["name"]
            print(f"{name} relates to B over {tree.interval.left:,.0f}-{tree.interval.right:,.0f}")
