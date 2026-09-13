import random

import msprime

import tracts


def split():
    d = msprime.Demography()
    d.add_population(name="A", initial_size=1000)
    d.add_population(name="B", initial_size=1000)
    d.add_population(name="ANC", initial_size=1000)
    d.add_population_split(time=20000, derived=["A", "B"], ancestral="ANC")
    return msprime.sim_ancestry(samples={"A": 10, "B": 10}, ploidy=1, demography=d,
                                sequence_length=1_000_000, recombination_rate=2e-9, random_seed=1)


def introgression():
    return tracts.simulate(154)


def sweep():
    length = 2_000_000
    model = [msprime.SweepGenicSelection(position=length / 2, start_frequency=1e-4,
                                         end_frequency=0.99, s=0.05, dt=1e-6),
             msprime.StandardCoalescent()]
    return msprime.sim_ancestry(samples=20, ploidy=1, population_size=10_000,
                                sequence_length=length, recombination_rate=1e-8,
                                model=model, random_seed=3)


LENGTH = 2_000_000
with open("stories/sim.fa", "w") as fa:
    rng = random.Random(0)
    fa.write(">chr1\n")
    for _ in range(LENGTH // 60):
        fa.write("".join(rng.choices("ACGT", k=60)) + "\n")
with open("stories/sim.fa.fai", "w") as fai:
    fai.write(f"chr1\t{LENGTH // 60 * 60}\t6\t60\t61\n")

for name, fn in [("split", split), ("introgression", introgression), ("sweep", sweep)]:
    ts = fn()
    ts.dump(f"stories/{name}.trees")
    print(name, "trees", ts.num_trees, "samples", ts.num_samples, "L", ts.sequence_length,
          "maxT", ts.tables.nodes.time.max(), [p.metadata for p in ts.populations()])
