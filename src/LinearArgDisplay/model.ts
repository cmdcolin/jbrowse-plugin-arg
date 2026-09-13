import {
  ConfigurationReference,
  getConf,
  setConf,
} from '@jbrowse/core/configuration'
import { BaseDisplay } from '@jbrowse/core/pluggableElementTypes/models'
import { getContainingView } from '@jbrowse/core/util'
import MultiRegionDisplayMixin from '@jbrowse/display-kit/MultiRegionDisplayMixin'
import StoredHoverMixin from '@jbrowse/display-kit/StoredHoverMixin'
import TrackHeightMixin from '@jbrowse/display-kit/TrackHeightMixin'
import { fetchEachRegion } from '@jbrowse/display-kit/fetchEachRegion'
import { types } from '@jbrowse/mobx-state-tree'
import { installUpload } from '@jbrowse/render-core/installUpload'

import { dendrogramPx, toTimeScale } from './components/argTypes.ts'
import { findArgHit, sameArgHit } from './components/findArgHit.ts'
import { populationColor } from './components/palette.ts'
import { layoutTreeCells } from './components/treeCells.ts'
import { buildArgTrackMenuItems } from './trackMenuItems.ts'

import type { ArgRegionData } from '../ArgRPC/rpcTypes.ts'
import type {
  ArgRenderState,
  ArgRenderingBackend,
  DrawMode,
} from './components/argTypes.ts'
import type { ArgHit } from './components/findArgHit.ts'
import type { LinearArgDisplayConfigModel } from './configSchema.ts'
import type { Region } from '@jbrowse/core/util'
import type { Instance } from '@jbrowse/mobx-state-tree'
import type { LinearGenomeViewModel } from '@jbrowse/plugin-linear-genome-view'

/**
 * #stateModel LinearArgDisplay
 * #displayFoundation MultiRegionDisplayMixin
 * The local trees of a tskit tree sequence drawn along the genome.
 */
export function modelFactory(configSchema: LinearArgDisplayConfigModel) {
  return types
    .compose(
      'LinearArgDisplay',
      BaseDisplay,
      TrackHeightMixin(),
      MultiRegionDisplayMixin(),
      StoredHoverMixin<ArgHit>(sameArgHit),
      types.model({
        type: types.literal('LinearArgDisplay'),
        configuration: ConfigurationReference(configSchema),
      }),
    )
    .views(self => ({
      get rpcDataMap(): ReadonlyMap<number, ArgRegionData> {
        return self.regionPayloads as ReadonlyMap<number, ArgRegionData>
      },
      get view() {
        return getContainingView(self) as LinearGenomeViewModel
      },
      rpcProps() {
        return {
          maxEdges: getConf(self, 'maxEdges'),
          maxSkylinePoints: getConf(self, 'maxSkylinePoints'),
          painting: getConf(self, 'drawMode') === 'painting',
        }
      },
    }))
    .views(self => ({
      /**
       * The oldest node in the whole file, which every region payload carries.
       * Scaling to the file rather than to what is on screen is what keeps the
       * time axis still while panning.
       */
      get maxTime() {
        for (const data of self.rpcDataMap.values()) {
          return data.maxNodeTime
        }
        return 1
      },
      /** what the fetch decided it could send, for the display's own menu */
      get detail() {
        for (const data of self.rpcDataMap.values()) {
          return data.detail
        }
        return undefined
      },
      get numSamples() {
        for (const data of self.rpcDataMap.values()) {
          return data.numSamples
        }
        return 0
      },
      get populationNames(): string[] {
        for (const data of self.rpcDataMap.values()) {
          return data.populationNames
        }
        return []
      },
      get samplePopulations(): number[] {
        for (const data of self.rpcDataMap.values()) {
          return data.samplePopulations
        }
        return []
      },
      get sampleNames(): string[] {
        for (const data of self.rpcDataMap.values()) {
          return data.sampleNames
        }
        return []
      },
      get sampleRows(): Int32Array {
        for (const data of self.rpcDataMap.values()) {
          return data.sampleRows
        }
        return new Int32Array(0)
      },
      get samplePopulation(): Int32Array {
        for (const data of self.rpcDataMap.values()) {
          return data.samplePopulation
        }
        return new Int32Array(0)
      },
      get timeUnits() {
        for (const data of self.rpcDataMap.values()) {
          return data.timeUnits
        }
        return ''
      },
      get treesInView() {
        let total = 0
        for (const data of self.rpcDataMap.values()) {
          total += data.treesInRegion
        }
        return total
      },
    }))
    .views(self => ({
      get highlightSamples(): number[] {
        return getConf(self, 'highlightSamples')
          .map(Number)
          .filter(Number.isInteger)
      },
      get drawMode(): DrawMode {
        return getConf(self, 'drawMode') === 'painting' ? 'painting' : 'trees'
      },
      /**
       * Whether anything on screen is actually drawn as a tree. Every tree
       * narrower than its leaves need is painted as a TMRCA segment in one
       * color, so at that zoom no branch carries a population and a legend
       * would be advertising an encoding that is not on screen.
       */
      get hasDendrogram() {
        const minWidthBp =
          dendrogramPx(self.numSamples, getConf(self, 'pxPerLeaf')) *
          self.view.bpPerPx
        return [...self.rpcDataMap.values()].some(
          data => layoutTreeCells(data, minWidthBp).cells.length > 0,
        )
      },
      get populationColors(): string[] {
        const colors: string[] = []
        // One population is not a distinction. Coloring by it would say
        // nothing and the legend would be a single entry explaining the only
        // color on screen.
        if (
          getConf(self, 'colorBy') === 'population' &&
          self.samplePopulations.length > 1
        ) {
          // Indexed by population id but colored by rank among the populations
          // that have samples: a file can declare hundreds of populations and
          // carry twenty, and keying the palette on the id would hand two of
          // those twenty the same hue for no reason.
          self.samplePopulations.forEach((id, rank) => {
            colors[id] = populationColor(rank)
          })
        }
        return colors
      },
    }))
    .views(self => ({
      get legend() {
        return self.drawMode === 'trees' && !self.hasDendrogram
          ? []
          : self.samplePopulations
              .map(id => ({
                id,
                name: self.populationNames[id] ?? `population ${id}`,
                color: self.populationColors[id],
              }))
              .filter(entry => entry.color !== undefined)
      },
    }))
    .views(self => ({
      get renderState(): ArgRenderState {
        return {
          drawMode: self.drawMode,
          canvasWidth: self.canvasWidthPx,
          canvasHeight: self.height,
          maxTime: self.maxTime,
          timeScale: toTimeScale(getConf(self, 'timeScale')),
          branchColor: getConf(self, 'branchColor'),
          skylineColor: getConf(self, 'skylineColor'),
          gridlineColor: getConf(self, 'gridlineColor'),
          treeCellColor: getConf(self, 'separateTrees')
            ? getConf(self, 'treeCellColor')
            : '',
          sampleSpanColor: getConf(self, 'sampleSpanColor'),
          populationColors: self.populationColors,
          pxPerLeaf: getConf(self, 'pxPerLeaf'),
          numSamples: self.numSamples,
          showMutations: getConf(self, 'showMutations'),
          mutationColor: getConf(self, 'mutationColor'),
          highlightSamples: self.highlightSamples,
          highlightColor: getConf(self, 'highlightColor'),
          hoveredClade: self.hoveredFeature?.branch
            ? {
                treeStart: self.hoveredFeature.treeStart,
                node: self.hoveredFeature.branch.node,
              }
            : undefined,
        }
      },
    }))
    .views(self => {
      const { trackMenuItems: superTrackMenuItems } = self
      return {
        trackMenuItems() {
          return [
            ...superTrackMenuItems(),
            ...buildArgTrackMenuItems({
              drawMode: self.drawMode,
              timeScale: toTimeScale(getConf(self, 'timeScale')),
              colorByPopulation: getConf(self, 'colorBy') === 'population',
              showMutations: getConf(self, 'showMutations'),
              separateTrees: getConf(self, 'separateTrees'),
              highlightSamples: self.highlightSamples,
              setSetting: (slot, value) => {
                setConf(self, slot as 'drawMode', value)
              },
            }),
          ]
        },
      }
    })
    .views(self => ({
      argHitAt(mouseX: number, mouseY: number) {
        return findArgHit(
          mouseX,
          mouseY,
          self.renderBlocks,
          self.rpcDataMap,
          self.renderState,
        )
      },
    }))
    .actions(self => ({
      /** follow a branch's node through every tree, or stop following it */
      toggleTrace(node: number) {
        const traced = self.highlightSamples
        setConf(
          self,
          'highlightSamples',
          (traced.includes(node)
            ? traced.filter(n => n !== node)
            : [...traced, node]
          ).map(String),
        )
      },
      fetchNeeded(needed: { region: Region; displayedRegionIndex: number }[]) {
        const { adapterConfig } = self
        return fetchEachRegion(self, needed, {
          call: (region, ctx) =>
            ctx.callRpc('ArgGetRegion', {
              adapterConfig,
              region,
              ...self.rpcProps(),
            }),
          onResult: (_idx, result) => result,
        })
      },
      startRenderingBackend(backend: ArgRenderingBackend) {
        installUpload(self, backend, {
          cells: () => self.rpcDataMap,
          render: (b, regions) => {
            if (regions.size === 0) {
              return false
            }
            b.renderBlocks(self.renderBlocks, regions, self.renderState)
            return true
          },
        })
      },
    }))
}

export type LinearArgDisplayStateModel = ReturnType<typeof modelFactory>
export type LinearArgDisplayModel = Instance<LinearArgDisplayStateModel>
