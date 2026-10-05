import type { ArgDraw } from './components/argTypes.ts'
import type { MenuItem } from '@jbrowse/core/ui/menuItems'

interface ArgMenuSelf {
  draw: ArgDraw
  timeScale: 'linear' | 'log'
  colorByPopulation: boolean
  showMutations: boolean
  separateTrees: boolean
  highlightSamples: number[]
  setSetting: (slot: string, value: unknown) => void
}

/**
 * Every setting a reader reaches for while looking at the picture, so none of
 * them needs a config edit. Plain descriptors rather than core's builders,
 * which the hosts this plugin supports do not all re-export.
 */
export function buildArgTrackMenuItems(self: ArgMenuSelf): MenuItem[] {
  const drawChoices: [ArgDraw, string][] = [
    ['both', 'Trees and TMRCA line'],
    ['trees', 'Trees'],
    ['tmrca', 'TMRCA line'],
  ]
  return [
    {
      label: 'Draw',
      subMenu: drawChoices.map(([value, label]) => ({
        label,
        type: 'radio' as const,
        checked: self.draw === value,
        onClick: () => {
          self.setSetting('draw', value)
        },
      })),
    },
    {
      label: 'Log time scale',
      type: 'checkbox',
      checked: self.timeScale === 'log',
      onClick: () => {
        self.setSetting(
          'timeScale',
          self.timeScale === 'log' ? 'linear' : 'log',
        )
      },
    },
    {
      label: 'Color by population',
      type: 'checkbox',
      checked: self.colorByPopulation,
      onClick: () => {
        self.setSetting(
          'colorBy',
          self.colorByPopulation ? 'none' : 'population',
        )
      },
    },
    {
      label: 'Show mutations',
      type: 'checkbox',
      checked: self.showMutations,
      onClick: () => {
        self.setSetting('showMutations', !self.showMutations)
      },
    },
    {
      label: 'Separate trees',
      type: 'checkbox',
      checked: self.separateTrees,
      onClick: () => {
        self.setSetting('separateTrees', !self.separateTrees)
      },
    },
    ...(self.highlightSamples.length > 0
      ? [
          {
            label: `Clear traced lineages (${self.highlightSamples.length})`,
            onClick: () => {
              self.setSetting('highlightSamples', [])
            },
          },
        ]
      : []),
  ]
}
