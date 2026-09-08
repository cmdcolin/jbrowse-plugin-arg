import { ConfigurationSchema } from '@jbrowse/core/configuration'
import { types } from '@jbrowse/mobx-state-tree'

/**
 * #config LinearArgDisplay
 * Local trees of an ancestral recombination graph drawn along the genome: x is
 * genomic position, y is node time.
 */
export const configSchema = ConfigurationSchema(
  'LinearArgDisplay',
  {
    /**
     * #slot
     */
    height: {
      type: 'number',
      defaultValue: 250,
      description: 'height of the display in pixels',
    },
    /**
     * #slot
     */
    branchColor: {
      type: 'color',
      defaultValue: '#3a4a5c',
      description: 'color of the tree branches',
    },
    /**
     * #slot
     */
    skylineColor: {
      type: 'color',
      defaultValue: '#c33',
      description:
        'color of the TMRCA line drawn when a region holds too many trees to draw',
    },
    /**
     * #slot
     * `log` keeps recent coalescences legible next to a deep root
     */
    timeScale: {
      type: 'stringEnum',
      model: types.enumeration('ArgTimeScale', ['linear', 'log']),
      defaultValue: 'log',
      description: 'how node times map to the vertical axis',
    },
    /**
     * #slot
     * the edge budget one fetch may return before it falls back to a TMRCA
     * skyline; this is what decides detail, since the fetched region is the
     * buffered viewport
     */
    maxEdges: {
      type: 'number',
      defaultValue: 300_000,
      description: 'edges per fetch above which only a TMRCA skyline is sent',
    },
    /**
     * #slot
     */
    maxSkylinePoints: {
      type: 'number',
      defaultValue: 4000,
      description: 'points a TMRCA skyline is binned down to',
    },
    /**
     * #slot
     * `population` colors a branch by the population every leaf under it
     * belongs to, leaving the branches above a join in `branchColor`
     */
    colorBy: {
      type: 'stringEnum',
      model: types.enumeration('ArgColorBy', ['none', 'population']),
      defaultValue: 'population',
      description: 'what the branch color means',
    },
    /**
     * #slot
     * neighbouring local trees look alike once they share a leaf order, so
     * each gets its own faint cell with a gutter between them
     */
    separateTrees: {
      type: 'boolean',
      defaultValue: true,
      description: 'give each local tree its own background cell',
    },
    /**
     * #slot
     */
    treeCellColor: {
      type: 'color',
      defaultValue: '#e9eef5',
      description: 'background behind a single local tree',
    },
    /**
     * #slot
     */
    gridlineColor: {
      type: 'color',
      defaultValue: '#e4e4e4',
      description: 'color of the time axis gridlines',
    },
    /**
     * #slot
     * a tree narrower than this times its leaf count draws as its TMRCA
     */
    pxPerLeaf: {
      type: 'number',
      defaultValue: 2,
      description: 'pixels a leaf needs before a tree draws its topology',
    },
  },
  { explicitIdentifier: 'displayId', explicitlyTyped: true },
)

export type LinearArgDisplayConfigModel = typeof configSchema
