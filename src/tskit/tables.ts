import { readKastore } from './kastore.ts'

import type { KastoreArray, KastoreStore } from './kastore.ts'

export const NODE_IS_SAMPLE = 1

export interface TreeSequenceTables {
  sequenceLength: number
  timeUnits: string
  numNodes: number
  numEdges: number
  numSamples: number
  nodeTime: Float64Array
  nodeFlags: Uint32Array
  nodePopulation: Int32Array
  samples: Int32Array
  edgeLeft: Float64Array
  edgeRight: Float64Array
  edgeParent: Int32Array
  edgeChild: Int32Array
  insertionOrder: Int32Array
  removalOrder: Int32Array
  sitePosition: Float64Array
  mutationSite: Int32Array
  mutationNode: Int32Array
  maxNodeTime: number
}

function get(store: KastoreStore, key: string): KastoreArray {
  const value = store.get(key)
  if (!value) {
    throw new Error(`tree sequence file is missing "${key}"`)
  }
  return value
}

function typed<T extends KastoreArray>(
  store: KastoreStore,
  key: string,
  ArrayType: new (length: number) => T,
): T {
  const value = get(store, key)
  if (!(value instanceof ArrayType)) {
    throw new Error(`"${key}" has unexpected type ${value.constructor.name}`)
  }
  return value
}

function decodeText(value: KastoreArray) {
  return new TextDecoder().decode(
    new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
  )
}

function max(values: Float64Array) {
  let result = 0
  for (const value of values) {
    if (value > result) {
      result = value
    }
  }
  return result
}

export function readTreeSequenceTables(
  buffer: ArrayBuffer,
): TreeSequenceTables {
  const store = readKastore(buffer)
  const formatName = decodeText(get(store, 'format/name'))
  if (formatName !== 'tskit.trees') {
    throw new Error(`not a tskit tree sequence: format is "${formatName}"`)
  }
  const sequenceLength = typed(store, 'sequence_length', Float64Array)[0]
  if (sequenceLength === undefined) {
    throw new Error('tree sequence file has an empty sequence_length')
  }
  const nodeTime = typed(store, 'nodes/time', Float64Array)
  const nodeFlags = typed(store, 'nodes/flags', Uint32Array)
  const sampleList: number[] = []
  for (let i = 0; i < nodeFlags.length; i++) {
    if ((nodeFlags[i]! & NODE_IS_SAMPLE) !== 0) {
      sampleList.push(i)
    }
  }
  const edgeParent = typed(store, 'edges/parent', Int32Array)
  return {
    sequenceLength,
    timeUnits: decodeText(get(store, 'time_units')),
    numNodes: nodeTime.length,
    numEdges: edgeParent.length,
    numSamples: sampleList.length,
    nodeTime,
    nodeFlags,
    nodePopulation: typed(store, 'nodes/population', Int32Array),
    samples: Int32Array.from(sampleList),
    edgeLeft: typed(store, 'edges/left', Float64Array),
    edgeRight: typed(store, 'edges/right', Float64Array),
    edgeParent,
    edgeChild: typed(store, 'edges/child', Int32Array),
    insertionOrder: typed(store, 'indexes/edge_insertion_order', Int32Array),
    removalOrder: typed(store, 'indexes/edge_removal_order', Int32Array),
    sitePosition: typed(store, 'sites/position', Float64Array),
    mutationSite: typed(store, 'mutations/site', Int32Array),
    mutationNode: typed(store, 'mutations/node', Int32Array),
    maxNodeTime: max(nodeTime),
  }
}
