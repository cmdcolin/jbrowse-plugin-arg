import { ConfigurationSchema } from '@jbrowse/core/configuration'

/**
 * #config ArgAdapter
 * A tskit tree sequence (`.trees`). The whole file is fetched and parsed in the
 * worker: the format is a flat key-value store of columnar arrays with no
 * genomic index, so there is nothing to range-request against.
 */
export default ConfigurationSchema(
  'ArgAdapter',
  {
    /**
     * #slot
     */
    treesLocation: {
      type: 'fileLocation',
      defaultValue: { uri: '/path/to/my.trees', locationType: 'UriLocation' },
      description: 'location of a tskit .trees file',
    },
    /**
     * #slot
     * the assembly reference sequence the tree sequence's coordinates are in
     */
    refName: {
      type: 'string',
      defaultValue: '',
      description:
        'reference sequence name the tree sequence coordinates belong to',
    },
  },
  { explicitlyTyped: true },
)
