import { getContract, TestFn, runTestArray, ExpectGood, ExpectBad } from './testHelpers.spec.js'

type INPUT = {id?:string | string[]} | undefined
const contract = getContract<'GET', INPUT>({
  method: 'GET',
  implementation: { type: 'key-value', backend: 'memory', prefix: 'test', allowGetAll: true },
  arguments: { id: ['string', '?', { $array: 'string' }] },
  returns: { a: 'string', b: 'number' }
})
type GC = typeof contract
const getTests = ():[string, TestFn<GC>][] => {
  const testsToRun:[string, TestFn<GC>][] = []
  const push = (key:string, fn:TestFn<GC>) => testsToRun.push([key, fn])

  push('get input is optional', ExpectGood(
    (db, c:GC) => db.get(c, {}, [], undefined),
    (a, t) => t.deepEqual(a.result, [] as any)))

  push('get id is optional (sometimes)', ExpectGood(
    (db, c:GC) => db.get(c, {}, undefined, undefined),
    (a, t) => t.deepEqual(a.result, [] as any)))

  push('get with single id returns notFound error', ExpectBad(
    (db, c:GC) => db.get(c, {}, 'idIn', { }),
    (a, t) => t.is(a.errorType, 'notFound')))

  push('get with single id in body returns notFound error', ExpectBad(
    (db, c:GC) => db.get(c, {}, undefined, { id: 'idIn' }),
    (a, t) => t.is(a.errorType, 'notFound')))

  push('get with an array id with non existing records returns empty array', ExpectGood(
    (db, c:GC) => db.get(c, {}, ['imagineId'], {}),
    (a, t) => t.deepEqual(a.result, [] as any)))

  push('get with empty array id returns empty array', ExpectGood(
    (db, c:GC) => db.get(c, {}, [], {}),
    (a, t) => t.deepEqual(a.result, [] as any)))

  push('get with empty array id in the body returns empty array', ExpectGood(
    (db, c:GC) => db.get(c, {}, undefined, { id: [] }),
    (a, t) => t.deepEqual(a.result, [] as any)))

  return testsToRun
}

runTestArray(contract, getTests())
