import { getContract, TestFn, runTestArray, ExpectGood, ExpectBad } from './testHelpers.spec.js'
import { AbstractBackend } from './backendAbstract.js'
import { AnyContract, AuthInput } from './globalTypes.js'
import { generate, Validation, validate } from 'yaschva'

type INPUT = {id?:string | string[]} | undefined
type OUTPUT = {a:string, b?:number}[]
const postType = { a: 'string', b: ['number', '?'] }
const contract = getContract<'GET', INPUT, OUTPUT>({
  method: 'GET',
  implementation: { type: 'key-value', backend: 'memory', prefix: 'test', allowGetAll: true },
  arguments: { id: ['string', '?', { $array: 'string' }] },
  returns: { $array: postType }
})

type GC = typeof contract
const getTests = ():[string, TestFn<GC>][] => {
  const testsToRun:[string, TestFn<GC>][] = []
  const test = (key:string, fn:TestFn<GC>) => testsToRun.push([key, fn])

  test('get input is optional', ExpectGood(
    (db, c:GC) => db.get(c, {}, [], undefined),
    (a, t) => t.deepEqual(a.result, [])))

  test('get id and input is optional', ExpectGood(
    (db, c:GC) => db.get(c, {}, undefined, undefined),
    (a, t) => t.deepEqual(a.result, [])))

  test('get with single id returns notFound error', ExpectBad(
    (db, c:GC) => db.get(c, {}, 'idIn', { }),
    (a, t) => t.is(a.errorType, 'notFound')))

  test('get with single id in body returns notFound error', ExpectBad(
    (db, c:GC) => db.get(c, {}, undefined, { id: 'idIn' }),
    (a, t) => t.is(a.errorType, 'notFound')))

  test('get with an array id with non existing records returns empty array', ExpectGood(
    (db, c:GC) => db.get(c, {}, ['imagineId'], {}),
    (a, t) => t.deepEqual(a.result, [])))

  test('get with empty array id returns empty array', ExpectGood(
    (db, c:GC) => db.get(c, {}, [], {}),
    (a, t) => t.deepEqual(a.result, [])))

  test('get with empty array id in the body returns empty array', ExpectGood(
    (db, c:GC) => db.get(c, {}, undefined, { id: [] }),
    (a, t) => t.deepEqual(a.result, [])))

  const defaultNum = 20
  const postSome = async (db:AbstractBackend<any>,
    contract:AnyContract,
    schema:Validation,
    authInput:AuthInput = {},
    num:number = defaultNum) => {
    const id = (i:number) => `my_id_${authInput?.sub || ''}${i}`
    return (await Promise.all(Array.from(Array(num)).map((_, i) => db.post(contract, authInput, id(i), generate(schema)))))
      .map((x, i) => {
        if (x.errors) throw new Error(`Failed to post with id ${id(i)}: ${JSON.stringify(x, null, 2)}`)
        return x
      })
  }

  test('get posted id and input is optional, all is returned', ExpectGood(
    async (db, c:GC) => (await postSome(db, c, postType)) && db.get(c, {}, undefined, undefined),
    (a, t, c) => {
      t.is(validate(c.returns, a.result).result, 'pass')
      t.is((a.result).length, defaultNum)
    }))

  test('get posted by id', ExpectGood(
    async (db, c:GC) => (await postSome(db, c, postType)) && db.get(c, {}, 'my_id_2', undefined),
    (a, t, c) => {
      t.is((a.result).length, 1)
      t.is(validate(c.returns, a.result).result, 'pass')
    }))

  test('get posted by id in body', ExpectGood(
    async (db, c:GC) => (await postSome(db, c, postType)) && db.get(c, {}, undefined, { id: 'my_id_6' }),
    (a, t, c) => {
      t.is((a.result).length, 1)
      t.is(validate(c.returns, a.result).result, 'pass')
    }))

  const withAuth = (c: GC):GC => ({
    ...c,
    authentication: ['admin', { createdBy: true }],
    manageFields: { createdBy: true },
    returns: { $array: { ...((c.returns as any).$array), createdBy: 'string' } }
  })
  test('get with permissions: posted id and input is optional, unauthorized gets nothing back', ExpectGood(
    async (db, c:GC) => (await postSome(db, withAuth(c), postType, { sub: 'userA' })) && db.get(withAuth(c), {}, undefined, undefined),
    (a, t) => t.is((a.result).length, 0)))

  test('get with permissions: posted id and input is optional, all is returned for authorized user by permission', ExpectGood(
    async (db, c:GC) => (await postSome(db, withAuth(c), postType, { sub: 'userA' })) && db.get(withAuth(c), { sub: 'userB', permissions: ['admin'] }, undefined, undefined),
    (a, t, c) => {
      t.is(validate(withAuth(c).returns, a.result).result, 'pass')
      t.is((a.result).length, defaultNum)
    }))

  test('get with permissions: posted id and input is optional, all is returned for authorized user by userId', ExpectGood(
    async (db, c:GC) => (await postSome(db, withAuth(c), postType, { sub: 'userA' })) && db.get(withAuth(c), { sub: 'userA', permissions: [] }, undefined, undefined),
    (a, t, c) => {
      t.is(validate(withAuth(c).returns, a.result).result, 'pass')
      t.is((a.result).length, defaultNum)
    }))

  test('get with permissions: posted id and input is optional, all is returned for authorized user by userId (with records from multiple users)', ExpectGood(
    async (db, c:GC) => (await postSome(db, withAuth(c), postType, { sub: 'userA' }, 10)) &&
    (await postSome(db, withAuth(c), postType, { sub: 'userB' }, 10)) &&
    (await postSome(db, withAuth(c), postType, { sub: 'userC' }, 20)) &&
    db.get(withAuth(c), { sub: 'userA', permissions: [] }, undefined, undefined),
    (a, t, c) => {
      t.is(validate(withAuth(c).returns, a.result).result, 'pass')
      t.is((a.result).length, 10)
    }))

  test('get with permissions: unauthorized user gets forbidden', ExpectBad(
    async (db, c:GC) => (await postSome(db, withAuth(c), postType, { sub: 'userA' })) && db.get(withAuth(c), { sub: 'userB', permissions: [] }, 'my_id_userA0', undefined),
    (a, t) => t.is((a.status), 403)))

  test('get with permissions: get array of ids, unauthorized user gets empty array', ExpectGood(
    async (db, c:GC) => (await postSome(db, withAuth(c), postType, { sub: 'userA' })) && db.get(withAuth(c), { sub: 'userB', permissions: [] }, ['my_id_userA0', 'my_id_userA1'], undefined),
    (a, t) => t.is(a.result.length, 0)))

  return testsToRun
}

runTestArray(contract, getTests())
