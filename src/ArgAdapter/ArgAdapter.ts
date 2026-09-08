import {
  BaseAdapter,
  cachedSetup,
} from '@jbrowse/core/data_adapters/BaseAdapter'
import { openLocation } from '@jbrowse/core/util/io'

import { readTreeSequenceTables } from '../tskit/tables.ts'

import type { TreeSequenceTables } from '../tskit/tables.ts'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'

const ZSTD_MAGIC = 0x28b52ffd

export default class ArgAdapter extends BaseAdapter {
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

  freeResources() {}
}
