"""A hard selective sweep at 1 Mb in 2 Mb of sequence, and a matching reference.

uv run --with msprime==1.4.4 python scripts/figures/simulate_sweep.py
"""

import random
from pathlib import Path

import msprime

LENGTH = 2_000_000
SWEEP_AT = 1_000_000
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

ts = msprime.sim_ancestry(
    samples=20,
    ploidy=1,
    population_size=10_000,
    sequence_length=LENGTH,
    recombination_rate=1e-8,
    model=[
        msprime.SweepGenicSelection(
            position=SWEEP_AT,
            start_frequency=1e-4,
            end_frequency=0.99,
            s=0.05,
            dt=1e-6,
        ),
        msprime.StandardCoalescent(),
    ],
    random_seed=3,
)
ts.dump(OUT / "sweep.trees")

rng = random.Random(0)
with open(OUT / "sim.fa", "w") as fa:
    fa.write(">chr1\n")
    for _ in range(LENGTH // 60):
        fa.write("".join(rng.choices("ACGT", k=60)) + "\n")
(OUT / "sim.fa.fai").write_text(f"chr1\t{LENGTH}\t6\t60\t61\n")

swept = ts.at(SWEEP_AT)
print(f"{ts.num_trees} trees; the tree at {SWEEP_AT:,} spans "
      f"{swept.interval.left:,.0f}-{swept.interval.right:,.0f} with TMRCA "
      f"{max(ts.node(r).time for r in swept.roots):,.0f} generations")
