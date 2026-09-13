import {
  BaseFeatureDataAdapter,
  cachedSetup,
} from '@jbrowse/core/data_adapters/BaseAdapter'
import { SimpleFeature } from '@jbrowse/core/util'
import { openLocation } from '@jbrowse/core/util/io'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'

import { readTreeSequenceTables } from '../tskit/tables.ts'
import { paintingRuns } from './paintingFeatures.ts'

import type { TreeSequenceTables } from '../tskit/tables.ts'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { Region } from '@jbrowse/core/util'

const ZSTD_MAGIC = 0x28b52ffd

export default class ArgAdapter extends BaseFeatureDataAdapter {
  private setup = cachedSetup({
    label: 'Downloading tree sequence',
    setup: async (opts: BaseOptions) => {
      const bytes = await openLocation(
        this.getConf('treesLocation'),
        this.pluginManager,
      ).readFile(opts)
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer
      if (new DataView(buffer).getUint32(0, true) === ZSTD_MAGIC) {
        throw new Error(
          'this looks like a compressed .trees.tsz file; decompress it with `tsunzip` first',
        )
      }
      return readTreeSequenceTables(buffer)
    },
  })

  async getTables(opts: BaseOptions = {}): Promise<TreeSequenceTables> {
    return this.setup(opts)
  }

  get refName(): string {
    return this.getConf('refName')
  }

  async getRefNames() {
    return this.refName ? [this.refName] : []
  }

  /**
   * The ancestry painting as features, one per run of trees in which a sample's
   * nearest relatives stay the same population, so any feature display can
   * draw it. `row` names the sample prefixed by its own population, which is
   * what a multi-row display partitions and groups by.
   */
  getFeatures(
    region: Region,
    opts: BaseOptions = {},
  ): ReturnType<BaseFeatureDataAdapter['getFeatures']> {
    return ObservableCreate<SimpleFeature>(async observer => {
      const tables = await this.getTables(opts)
      if (!this.refName || this.refName === region.refName) {
        const start = Math.max(0, region.start)
        const end = Math.min(tables.sequenceLength, region.end)
        if (end > start) {
          for (const run of paintingRuns(tables, start, end)) {
            observer.next(
              new SimpleFeature({
                uniqueId: `${run.row}:${run.start}`,
                refName: region.refName,
                ...run,
              }),
            )
          }
        }
      }
      observer.complete()
    }, opts.stopToken)
  }

  freeResources() {}
}
