import { ConfigurationReference, getConf } from '@jbrowse/core/configuration'
import { BaseDisplay } from '@jbrowse/core/pluggableElementTypes/models'
import { getContainingView } from '@jbrowse/core/util'
import MultiRegionDisplayMixin from '@jbrowse/display-kit/MultiRegionDisplayMixin'
import TrackHeightMixin from '@jbrowse/display-kit/TrackHeightMixin'
import { fetchEachRegion } from '@jbrowse/display-kit/fetchEachRegion'
import { types } from '@jbrowse/mobx-state-tree'
import { installUpload } from '@jbrowse/render-core/installUpload'

import { toTimeScale } from './components/argTypes.ts'

import type { ArgRegionData } from '../ArgRPC/rpcTypes.ts'
import type {
  ArgRenderState,
  ArgRenderingBackend,
} from './components/argTypes.ts'
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
      get renderState(): ArgRenderState {
        return {
          canvasWidth: self.canvasWidthPx,
          canvasHeight: self.height,
          maxTime: self.maxTime,
          timeScale: toTimeScale(getConf(self, 'timeScale')),
          branchColor: getConf(self, 'branchColor'),
          skylineColor: getConf(self, 'skylineColor'),
          gridlineColor: getConf(self, 'gridlineColor'),
          pxPerLeaf: getConf(self, 'pxPerLeaf'),
          numSamples: self.numSamples,
        }
      },
    }))
    .actions(self => ({
      fetchNeeded(
        needed: { region: Region; displayedRegionIndex: number }[],
      ) {
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
