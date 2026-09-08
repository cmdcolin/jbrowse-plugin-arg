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
  /** one label per population id, from the population table's JSON metadata */
  populationNames: string[]
  /** population ids that actually have a sample, ascending */
  samplePopulations: number[]
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

/**
 * Split a tskit ragged column — a byte blob plus an offset array — and read
 * each row's JSON, which is where a population keeps the name worth showing.
 * Rows that hold something else are left unnamed rather than guessed at.
 */
function readMetadataNames(store: KastoreStore, prefix: string): string[] {
  const blob = store.get(`${prefix}/metadata`)
  const offsets = store.get(`${prefix}/metadata_offset`)
  if (!blob || !offsets) {
    return []
  }
  const bytes = new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength)
  const decoder = new TextDecoder()
  const names: string[] = []
  for (let i = 0; i + 1 < offsets.length; i++) {
    const from = Number(offsets[i]!)
    const to = Number(offsets[i + 1]!)
    let name = ''
    if (to > from) {
      try {
        const parsed: unknown = JSON.parse(
          decoder.decode(bytes.subarray(from, to)),
        )
        if (parsed && typeof parsed === 'object' && 'name' in parsed) {
          const value = (parsed as { name: unknown }).name
          name = typeof value === 'string' ? value : ''
        }
      } catch {
        name = ''
      }
    }
    names.push(name)
  }
  return names
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
  const nodePopulation = typed(store, 'nodes/population', Int32Array)
  return {
    sequenceLength,
    timeUnits: decodeText(get(store, 'time_units')),
    numNodes: nodeTime.length,
    numEdges: edgeParent.length,
    numSamples: sampleList.length,
    nodeTime,
    nodeFlags,
    nodePopulation,
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
    populationNames: readMetadataNames(store, 'populations'),
    samplePopulations: [
      ...new Set(sampleList.map(node => nodePopulation[node]!)),
    ]
      .filter(id => id >= 0)
      .sort((a, b) => a - b),
  }
}
