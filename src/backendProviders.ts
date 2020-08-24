import { AbstractBackend } from './backendAbstract.js'
import { getElasticsearchProvider } from './backendElasticsearch.js'

export type Providers = 'elasticsearch'
export const getProvider = (key: Providers):AbstractBackend<any> => {
  switch (key) {
    case 'elasticsearch':
      return getElasticsearchProvider()
    default : throw new Error(`Unknown provider ${key}`)
  }
}
