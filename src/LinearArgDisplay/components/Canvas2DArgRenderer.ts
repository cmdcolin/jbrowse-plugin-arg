import { createCanvas2DBackend } from '@jbrowse/render-core/createRenderingBackend'
import { Canvas2DPerRegionRenderingBackend } from '@jbrowse/render-core/perRegionRenderingBackend'

import { drawArgBlocks, drawTimeGridlines, drawTreeCells } from './drawArg.ts'

import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'
import type { ArgRenderState } from './argTypes.ts'
import type { RenderBlock } from '@jbrowse/render-core/renderBlock'

export class Canvas2DArgRenderer extends Canvas2DPerRegionRenderingBackend<
  ArgRegionData,
  ArgRenderState
> {
  protected draw(
    blocks: RenderBlock[],
    regions: ReadonlyMap<number, ArgRegionData>,
    state: ArgRenderState,
  ) {
    if (state.treeCellColor !== '') {
      drawTreeCells(this.ctx, regions, blocks, state)
    }
    drawTimeGridlines(this.ctx, state)
    drawArgBlocks(this.ctx, regions, blocks, state)
  }
}

export function ArgRenderer(canvas: HTMLCanvasElement) {
  return createCanvas2DBackend(canvas, c => new Canvas2DArgRenderer(c))
}
