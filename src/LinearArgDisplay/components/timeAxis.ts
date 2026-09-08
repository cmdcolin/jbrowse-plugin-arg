import type { TimeScale } from './argTypes.ts'

const TOP_PAD_PX = 3

export function timeToY(
  time: number,
  maxTime: number,
  height: number,
  scale: TimeScale,
) {
  const fraction =
    scale === 'log' ? Math.log1p(time) / Math.log1p(maxTime) : time / maxTime
  return height - fraction * (height - TOP_PAD_PX)
}

export interface TimeTick {
  time: number
  y: number
  label: string
}

function format(time: number) {
  if (time >= 1e6) {
    return `${time / 1e6}M`
  }
  if (time >= 1e3) {
    return `${time / 1e3}k`
  }
  return `${time}`
}

/**
 * Round times to label the vertical axis with. Log scale takes the powers of
 * ten that fit, which is what makes a recent coalescence and a deep root
 * readable on one axis; linear takes even steps.
 */
export function timeAxisTicks(
  maxTime: number,
  height: number,
  scale: TimeScale,
): TimeTick[] {
  const times: number[] = []
  if (scale === 'log') {
    for (let power = 0; 10 ** power <= maxTime; power++) {
      times.push(10 ** power)
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      times.push((maxTime * i) / 4)
    }
  }
  return times.map(time => ({
    time,
    y: timeToY(time, maxTime, height, scale),
    label: format(Number(time.toPrecision(2))),
  }))
}
