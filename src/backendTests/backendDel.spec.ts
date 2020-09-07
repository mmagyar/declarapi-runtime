import {
  TestFn,
  runTestArray,
  ExpectGood,
  ExpectBad,
  contractCollection,
  postSome,
  throwOnError,
  withAuth
} from '../testHelpers.spec.js'

const getTests = (): [string, TestFn][] => {
  const testsToRun: [string, TestFn][] = []
  const test = (key: string, fn: TestFn) => testsToRun.push([key, fn])

  test('can delete by id',
    ExpectBad(async (db, c) => {
      await postSome(db, c.post)
      throwOnError(await db.get(c.get, {}, 'my_id_1'))
      throwOnError(await db.delete(c.del, {}, 'my_id_1'))
      return db.get(c.get, {}, 'my_id_1')
    },
    (a, t) => t.is(a.status, 404)
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
