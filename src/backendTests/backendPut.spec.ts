import {
  TestFn,
  runTestArray,
  ExpectGood,
  ExpectBad,
  contractCollection,
  postSome,
  throwOnError,
  withAuth,
  ANY_CONTRACTS
} from '../testHelpers.spec.js'
import { generate } from 'yaschva'
import { AbstractBackend } from 'src/backendAbstract.js'
import { ExecutionContext } from 'ava'

const getTests = (): [string, TestFn][] => {
  const testsToRun: [string, TestFn][] = []
  const test = (key: string, fn: TestFn) => testsToRun.push([key, fn])

  test('can put by id', (db: AbstractBackend<any>, c: ANY_CONTRACTS) =>
    async (t: ExecutionContext) => {
      await postSome(db, c.post)
      throwOnError(await db.get(c.get, {}, 'my_id_1'))
      const generated = generate(c.put.arguments)
      throwOnError(await db.put(c.put, {}, 'my_id_1', generated))
      t.deepEqual((await db.get(c.get, {}, 'my_id_1')).result[0].value, generated)
    }
  )

  test('can not put non existing item', ExpectBad(
    async (db, c) => {
      const generated = generate(c.put.arguments)
      return db.put(c.put, {}, 'my_id_1', generated)
    // t.deepEqual((await db.get(c.get, {}, 'my_id_1')).result[0], generated)
    },
    (r, t) => t.is(r.status, 404)
  ))

  test('can not put by id record not owned', ExpectBad(
    async (db, c) => {
      await postSome(db, withAuth(c.post), { sub: 'userA' })
      throwOnError(await db.get(withAuth(c.get), { sub: 'userA' }, 'my_id_userA1'))
      const generated = generate(c.put.arguments)
      return db.put(withAuth(c.put), {}, 'my_id_userA1', generated)
    }, (r, t) => t.is(r.status, 403)
  ))

  test('putting own record retains the original createdBy', ExpectGood(
    async (db, c) => {
      await postSome(db, withAuth(c.post), { sub: 'userA' })
      throwOnError(await db.get(withAuth(c.get), { sub: 'userA' }, 'my_id_userA1'))
      const generated :any = { ...generate(c.put.arguments), createdBy: 'whoEver' }
      throwOnError(await db.put(withAuth(c.put),
        { sub: 'userB', permissions: ['admin'] }, 'my_id_userA1', generated))
      return db.get(withAuth(c.get), { sub: 'userA' }, 'my_id_userA1')
    }, (r, t) => t.is(r.result[0].metadata.createdBy, 'userA')
  ))

  return testsToRun
}

contractCollection().map(x => runTestArray(x, getTests()))
