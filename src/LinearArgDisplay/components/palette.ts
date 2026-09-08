/**
 * Okabe-Ito, which is the categorical set chosen for being distinguishable
 * under the common forms of color blindness. Populations cycle through it;
 * beyond eight the demo would need a legend more than it needs more hues.
 */
const OKABE_ITO = [
  '#0072b2',
  '#e69f00',
  '#009e73',
  '#cc79a7',
  '#d55e00',
  '#56b4e9',
  '#f0e442',
  '#000000',
]

export function populationColor(index: number) {
  return OKABE_ITO[index % OKABE_ITO.length]!
}
