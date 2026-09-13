import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'

/**
 * One tree standing in for more than this many hides most of what the column
 * holds, and the TMRCA line summarizes such a column better than a sample does.
 */
const MAX_TREES_PER_COLUMN = 4

/**
 * A stretch of genome drawn as one dendrogram, and the tree drawn there. A tree
 * wide enough for its leaves gets its own interval. Trees narrower than that
 * are grouped into columns `minWidthBp` wide, and each column draws the tree
 * among them that spans the most sequence: a row of readable samples of the
 * genealogy instead of a row of slivers.
 */
export interface TreeCell {
  tree: number
  start: number
  end: number
  sampled: boolean
}

export interface TreeCellLayout {
  cells: TreeCell[]
  /** trees too narrow even as a column's sample, drawn as their TMRCA */
  collapsed: number[]
}

export function layoutTreeCells(
  data: ArgRegionData,
  minWidthBp: number,
): TreeCellLayout {
  const cells: TreeCell[] = []
  const collapsed: number[] = []
  if (data.detail !== 'trees') {
    for (let i = 0; i < data.numTrees; i++) {
      if (data.edgeCount[i]! > 0) {
        collapsed.push(i)
      }
    }
    return { cells, collapsed }
  }
  let group: number[] = []
  let groupColumn = Number.NaN
  const flush = () => {
    if (group.length === 0) {
      return
    }
    const start = data.treeStart[group[0]!]!
    const end = data.treeEnd[group.at(-1)!]!
    if (end - start >= minWidthBp / 2 && group.length <= MAX_TREES_PER_COLUMN) {
      let best = group[0]!
      for (const i of group) {
        if (
          data.treeEnd[i]! - data.treeStart[i]! >
          data.treeEnd[best]! - data.treeStart[best]!
        ) {
          best = i
        }
      }
      cells.push({ tree: best, start, end, sampled: group.length > 1 })
    } else {
      collapsed.push(...group)
    }
    group = []
  }
  for (let i = 0; i < data.numTrees; i++) {
    const start = data.treeStart[i]!
    const end = data.treeEnd[i]!
    if (data.edgeCount[i] === 0) {
      flush()
    } else if (end - start >= minWidthBp) {
      flush()
      cells.push({ tree: i, start, end, sampled: false })
    } else {
      const column = Math.floor((start + end) / 2 / minWidthBp)
      if (column !== groupColumn) {
        flush()
        groupColumn = column
      }
      group.push(i)
    }
  }
  flush()
  return { cells, collapsed }
}
