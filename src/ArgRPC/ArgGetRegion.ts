import { getAdapter } from '@jbrowse/core/data_adapters/dataAdapterCache'
import RpcMethodType from '@jbrowse/core/pluggableElementTypes/RpcMethodType'

import { buildArgRegionData, emptyArgRegionData } from './buildArgRegionData.ts'

import type ArgAdapter from '../ArgAdapter/ArgAdapter.ts'
import type { ArgGetRegionArgs, ArgRegionData } from './rpcTypes.ts'
import type { RpcExecuteArgs } from '@jbrowse/core/rpc/RpcRegistry'

declare module '@jbrowse/core/rpc/RpcRegistry' {
  interface RpcRegistry {
    ArgGetRegion: {
      args: ArgGetRegionArgs
      return: ArgRegionData
    }
  }
}

function isArgAdapter(adapter: object): adapter is ArgAdapter {
  return 'getTables' in adapter && typeof adapter.getTables === 'function'
}

export default class ArgGetRegion extends RpcMethodType<'ArgGetRegion'> {
  name = 'ArgGetRegion' as const

  async execute(args: RpcExecuteArgs<'ArgGetRegion'>) {
    const {
      sessionId,
      adapterConfig,
      region,
      maxEdges,
      maxSkylinePoints,
      statusCallback,
      stopToken,
    } = args
    const { dataAdapter } = await getAdapter(
      this.pluginManager,
      sessionId,
      adapterConfig,
    )
    if (!isArgAdapter(dataAdapter)) {
      throw new Error(
        `adapter "${adapterConfig.type}" does not read tree sequences`,
      )
    }
    const adapter = dataAdapter
    const tables = await adapter.getTables({ statusCallback, stopToken })
    // A tree sequence covers one sequence. Without this an assembly with more
    // than one chromosome would draw the same ARG on every one of them.
    if (adapter.refName && adapter.refName !== region.refName) {
      return emptyArgRegionData(tables)
    }
    statusCallback?.('Building local trees')
    return buildArgRegionData({
      tables,
      start: Math.max(0, region.start),
      end: Math.min(tables.sequenceLength, region.end),
      maxEdges,
      maxSkylinePoints,
    })
  }
}
