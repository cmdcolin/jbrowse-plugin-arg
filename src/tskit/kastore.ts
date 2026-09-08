const MAGIC = Uint8Array.of(0x89, 0x4b, 0x41, 0x53, 0x0d, 0x0a, 0x1a, 0x0a)
const HEADER_SIZE = 64
const DESCRIPTOR_SIZE = 64

export type KastoreArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array
  | Float32Array
  | Float64Array

interface TypedArrayCtor {
  new (buffer: ArrayBuffer, byteOffset: number, length: number): KastoreArray
  new (buffer: ArrayBuffer): KastoreArray
  readonly BYTES_PER_ELEMENT: number
}

const arrayTypes: TypedArrayCtor[] = [
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  BigInt64Array,
  BigUint64Array,
  Float32Array,
  Float64Array,
]

export type KastoreStore = ReadonlyMap<string, KastoreArray>

export function readKastore(buffer: ArrayBuffer): KastoreStore {
  const header = new Uint8Array(
    buffer,
    0,
    Math.min(HEADER_SIZE, buffer.byteLength),
  )
  if (header.length < HEADER_SIZE) {
    throw new Error('file is too short to be a kastore file')
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (header[i] !== MAGIC[i]) {
      throw new Error('not a kastore file: bad magic number')
    }
  }
  const dv = new DataView(buffer)
  const versionMajor = dv.getUint16(8, true)
  if (versionMajor !== 1) {
    throw new Error(`unsupported kastore file version ${versionMajor}`)
  }
  const numItems = dv.getUint32(12, true)
  const decoder = new TextDecoder()
  const store = new Map<string, KastoreArray>()
  for (let i = 0; i < numItems; i++) {
    const at = HEADER_SIZE + i * DESCRIPTOR_SIZE
    const type = dv.getUint8(at)
    const ArrayType = arrayTypes[type]
    if (!ArrayType) {
      throw new Error(`unknown kastore array type ${type}`)
    }
    const keyStart = Number(dv.getBigUint64(at + 8, true))
    const keyLen = Number(dv.getBigUint64(at + 16, true))
    const arrayStart = Number(dv.getBigUint64(at + 24, true))
    const arrayLen = Number(dv.getBigUint64(at + 32, true))
    const key = decoder.decode(new Uint8Array(buffer, keyStart, keyLen))
    const byteLen = arrayLen * ArrayType.BYTES_PER_ELEMENT
    store.set(
      key,
      arrayStart % ArrayType.BYTES_PER_ELEMENT === 0
        ? new ArrayType(buffer, arrayStart, arrayLen)
        : new ArrayType(buffer.slice(arrayStart, arrayStart + byteLen)),
    )
  }
  return store
}
