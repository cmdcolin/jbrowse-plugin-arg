import msprime

SPLIT = 20000


def simulate(seed, proportion=0.03, time=500, length=1_200_000, size=1000, rate=1e-8):
    d = msprime.Demography()
    d.add_population(name="A", initial_size=size)
    d.add_population(name="B", initial_size=size)
    d.add_population(name="ANC", initial_size=size)
    d.add_mass_migration(time=time, source="A", dest="B", proportion=proportion)
    d.add_population_split(time=SPLIT, derived=["A", "B"], ancestral="ANC")
    d.sort_events()
    return msprime.sim_ancestry(samples={"A": 8, "B": 6}, ploidy=1, demography=d,
                                sequence_length=length, recombination_rate=rate,
                                random_seed=seed)


def tracts(ts, time_limit=SPLIT):
    a = [s for s in ts.samples() if ts.node(s).population == 0]
    b = [s for s in ts.samples() if ts.node(s).population == 1]
    runs = []
    for tree in ts.trees():
        for s in a:
            if any(tree.tmrca(s, t) < time_limit for t in b):
                last = next((r for r in reversed(runs) if r[0] == s), None)
                if last and last[2] == tree.interval.left:
                    last[2] = tree.interval.right
                else:
                    runs.append([s, tree.interval.left, tree.interval.right])
    return runs


if __name__ == "__main__":
    for seed in range(1, 200):
        ts = simulate(seed)
        runs = tracts(ts)
        if len(runs) == 1 and 120_000 < runs[0][2] - runs[0][1] < 400_000 and 350_000 < runs[0][1] < 600_000:
            print("seed", seed, "trees", ts.num_trees, "tract", runs)
