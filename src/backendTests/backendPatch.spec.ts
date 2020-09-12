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

  test('can patch by id', (db: AbstractBackend<any>, c: ANY_CONTRACTS) =>
    async (t: ExecutionContext) => {
      await postSome(db, c.post)
      const og = await db.get(c.get, {}, 'my_id_1')
      throwOnError(og)
      const generated = generate(c.patch.arguments)
      throwOnError(await db.patch(c.patch, {}, 'my_id_1', generated))
      t.deepEqual((await db.get(c.get, {}, 'my_id_1')).result, [{ ...og.result[0], ...generated }])
    }
  )

  test('can not patch non existing item', ExpectBad(
    async (db, c) =>
      // Put arguments are used here,
      // since patch arguments are optional,
      // and may generate an empty object
      db.patch(c.patch, {}, 'my_id_1', generate(c.put.arguments)),
    (r, t) => t.is(r.status, 404)
  ))

  test('patching with empty object results in no action', ExpectGood(
    async (db, c, t) => {
      const posted = await postSome(db, c.post)
      const patchRes = await db.patch(c.patch, {}, 'my_id_1', {})
      t.deepEqual((await db.get(c.get, {}, 'my_id_1')).result[0], posted[1].result)
      return patchRes
    },
    (r, t) => t.deepEqual(r.result, {})
  ))

  test('can not patch by id record not owned', ExpectBad(
    async (db, c) => {
      await postSome(db, withAuth(c.post), { sub: 'userA' })
      throwOnError(await db.get(withAuth(c.get), { sub: 'userA' }, 'my_id_userA1'))
      const generated = generate(c.patch.arguments)
      return db.patch(withAuth(c.patch), {}, 'my_id_userA1', generated)
    }, (r, t) => t.is(r.status, 403)
  ))

  test('patch own record retains the original createdBy', ExpectGood(
    async (db, c) => {
      await postSome(db, withAuth(c.post), { sub: 'userA' })
      throwOnError(await db.get(withAuth(c.get), { sub: 'userA' }, 'my_id_userA1'))
      const generated :any = { ...generate(c.patch.arguments), createdBy: 'whoEver' }
      throwOnError(await db.patch(withAuth(c.patch), { sub: 'userA' }, 'my_id_userA1', generated))
      return db.get(withAuth(c.get), { sub: 'userA' }, 'my_id_userA1')
    }, (r, t) => t.is(r.result[0].createdBy, 'userA')
  ))

  test('can delete by multiple ids',
    ExpectGood(async (db, c) => {
      await postSome(db, c.post)
      throwOnError(await db.get(c.get, {}, 'my_id_1'))
      throwOnError(await db.get(c.get, {}, 'my_id_3'))
      throwOnError(await db.get(c.get, {}, 'my_id_6'))
      throwOnError(await db.delete(c.del, {}, ['my_id_1', 'my_id_3', 'my_id_6']))
      return db.get(c.get, {}, ['my_id_1', 'my_id_3', 'my_id_6'])
    },
    (a, t) => t.deepEqual(a.result, [])
    )
  )

  test('can not delete one unauthorized',
    ExpectBad(async (db, c) => {
      await postSome(db, withAuth(c.post), { sub: 'userA' })
      throwOnError(await db.get(c.get, {}, 'my_id_userA1'))
      return await db.delete(withAuth(c.del), {}, 'my_id_userA1')
    },
    (a, t) => t.is(a.status, 403)
    )
  )

  test('can not delete many unauthorized',
    ExpectBad(async (db, c) => {
      await postSome(db, withAuth(c.post), { sub: 'userA' })
      await postSome(db, withAuth(c.post), { sub: 'userB' })
      throwOnError(await db.get(c.get, {}, 'my_id_userA1'))
      throwOnError(await db.get(c.get, {}, 'my_id_userB3'))
      throwOnError(await db.get(c.get, {}, 'my_id_userB6'))
      return await db.delete(withAuth(c.del), {}, ['my_id_userA1', 'my_id_userB3', 'my_id_userB6'])
    },
    (a, t) => {
      t.is(a.status, 403)
      t.is((a.errors as any).length, 3)
    }
    )
  )

  return testsToRun
}

contractCollection().map(x => runTestArray(x, getTests()))
