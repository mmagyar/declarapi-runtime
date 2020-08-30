import { AbstractBackend } from './backendAbstract.js'
import { getElasticsearchProvider } from './backendElasticsearch.js'
import { getKvProvider } from './backendKv.js'
import { BackEndTypes } from './globalTypes.js'

export const getProvider = (key: BackEndTypes):AbstractBackend<any> => {
  switch (key) {
    case 'elasticsearch':
      return getElasticsearchProvider()

    case 'key-value':
      return getKvProvider()
    default : throw new Error(`Unknown provider ${key}`)
  }
}
