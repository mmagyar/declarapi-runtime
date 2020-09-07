import { TestFn, runTestArray, ExpectGood, ExpectBad, contractCollection, ANY_CONTRACTS, postSome, withAuth } from '../testHelpers.spec.js'
import { AbstractBackend } from '../backendAbstract.js'
import { AnyContract, AuthInput } from '../globalTypes.js'
import { validate } from 'yaschva'

const getTests = (): [string, TestFn][] => {
  const testsToRun: [string, TestFn][] = []
  const test = (key: string, fn: TestFn) => testsToRun.push([key, fn])

  test('get input is optional', ExpectGood(
    (db, c) => db.get(c.get, {}, [], undefined),
    (a, t) => t.deepEqual(a.result, [])))

  test('get id and input is optional', ExpectGood(
    (db, c) => db.get(c.get, {}, undefined, undefined),
    (a, t) => t.deepEqual(a.result, [])))

  test('get with single id returns notFound error', ExpectBad(
    (db, c) => db.get(c.get, {}, 'idIn', {}),
    (a, t) => t.is(a.errorType, 'notFound')))

  test('get with single id in body returns notFound error', ExpectBad(
    (db, c) => db.get(c.get, {}, undefined, { id: 'idIn' }),
    (a, t) => t.is(a.errorType, 'notFound')))

  test('get with an array id with non existing records returns empty array', ExpectGood(
    (db, c) => db.get(c.get, {}, ['imagineId'], {}),
    (a, t) => t.deepEqual(a.result, [])))

  test('get with empty array id returns empty array', ExpectGood(
    (db, c) => db.get(c.get, {}, [], {}),
    (a, t) => t.deepEqual(a.result, [])))

  test('get with empty array id in the body returns empty array', ExpectGood(
    (db, c) => db.get(c.get, {}, undefined, { id: [] }),
    (a, t) => t.deepEqual(a.result, [])))

  const defaultNum = 20

  test('get posted id and input is optional, all is returned', ExpectGood(
    async (db, c) => (await postSome(db, c.post)) && db.get(c.get, {}, undefined, undefined),
    (a, t, c) => {
      t.is(validate(c.get.returns, a.result).result, 'pass')
      t.is((a.result).length, defaultNum)
    }))

  test('get posted by id', ExpectGood(
    async (db, c) => (await postSome(db, c.post)) && db.get(c.get, {}, 'my_id_2', undefined),
    (a, t, c) => {
      t.is((a.result).length, 1)
      t.is(validate(c.get.returns, a.result).result, 'pass')
    }))

  test('get posted by id in body', ExpectGood(
    async (db, c) => (await postSome(db, c.post)) && db.get(c.get, {}, undefined, { id: 'my_id_6' }),
    (a, t, c) => {
      t.is((a.result).length, 1)
      t.is(validate(c.get.returns, a.result).result, 'pass')
    }))

  const postWithAuth = async (db: AbstractBackend<any>, contracts: ANY_CONTRACTS, authInput: AuthInput, num: number = 20) =>
    postSome(db, withAuth(contracts.post), authInput, num)

  test('get with permissions: posted id and input is optional, unauthorized gets nothing back', ExpectGood(
    async (db, c) => (await postWithAuth(db, c, { sub: 'userA' })) && db.get(withAuth(c.get), {}, undefined, undefined),
    (a, t) => t.is((a.result).length, 0)))

  test('get with permissions: posted id and input is optional, all is returned for authorized user by permission', ExpectGood(
    async (db, c) => (await postWithAuth(db, c, { sub: 'userA' })) && db.get(withAuth(c.get), { sub: 'userB', permissions: ['admin'] }, undefined, undefined),
    (a, t, c) => {
      t.is(validate(withAuth(c.get).returns, a.result).result, 'pass')
      t.is((a.result).length, defaultNum)
    }))

  test('get with permissions: posted id and input is optional, all is returned for authorized user by userId', ExpectGood(
    async (db, c) => (await postWithAuth(db, c, { sub: 'userA' })) && db.get(withAuth(c.get), { sub: 'userA', permissions: [] }, undefined, undefined),
    (a, t, c) => {
      t.is(validate(withAuth(c.get).returns, a.result).result, 'pass')
      t.is((a.result).length, defaultNum)
    }))

  test('get with permissions: posted id and input is optional, all is returned for authorized user by userId (with records from multiple users)', ExpectGood(
    async (db, c) => (await postWithAuth(db, c, { sub: 'userA' }, 10)) &&
      (await postWithAuth(db, c, { sub: 'userB' }, 10)) &&
      (await postWithAuth(db, c, { sub: 'userC' }, 20)) &&
      db.get(withAuth(c.get), { sub: 'userA', permissions: [] }, undefined, undefined),
    (a, t, c) => {
      t.is(validate(withAuth(c.get).returns, a.result).result, 'pass')
      t.is((a.result).length, 10)
    }))

  test('get with permissions: unauthorized user gets forbidden', ExpectBad(
    async (db, c) => (await postWithAuth(db, c, { sub: 'userA' })) &&
      db.get(withAuth(c.get), { sub: 'userB', permissions: [] }, 'my_id_userA0', undefined),
    (a, t) => t.is((a.status), 403)))

  test('get with permissions: get array of ids, unauthorized user gets empty array', ExpectGood(
    async (db, c) => (await postWithAuth(db, c, { sub: 'userA' })) && db.get(withAuth(c.get), { sub: 'userB', permissions: [] }, ['my_id_userA0', 'my_id_userA1'], undefined),
    (a, t) => t.is(a.result.length, 0)))

  return testsToRun
}

runTestArray(contractCollection(), getTests())
