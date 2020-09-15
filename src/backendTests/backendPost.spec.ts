import { generate, validate } from 'yaschva'
import { TestFn, runTestArray, ExpectGood, ExpectBad, contractCollection } from '../testHelpers.spec.js'

const getTests = ():[string, TestFn][] => {
  const testsToRun:[string, TestFn][] = []
  const test = (key:string, fn:TestFn) => testsToRun.push([key, fn])

  test('can post generated data', ExpectGood(
    (db, c) => db.post(c.post, {}, 'uuid1', generate(c.post.arguments)),
    (r, t, c) => {
      t.is(validate(c.post.returns, r.result).result, 'pass',
        JSON.stringify(validate(c.post.returns, r.result)))
    }))

  test('can not override posted record', ExpectBad(
    async (db, c) => {
      if ((await db.post(c.post, {}, 'uuid1', generate(c.post.arguments))).errors) throw new Error('Fist post failed')
      return db.post(c.post, {}, 'uuid1', generate(c.post.arguments))
    }, (result, t, c) => {
      t.is(result.status, 409)
      t.is(validate(c.post.returns, result.result).result, 'fail')
    }))

  test('manageFields createdBy: saved and added to result', ExpectGood(
    (db, c) => db.post(c.post, { sub: 'userId' }, undefined, generate(c.post.arguments)),
    (result, t, c) => { t.is(validate(c.post.returns, result.result).result, 'pass') }))

  test('manageFields id: id is generated and saved and added to result', ExpectGood(
    (db, c) => db.post(c.post, { sub: 'userId' }, undefined, generate(c.post.arguments)),
    (result, t, c) => {
      t.is(typeof result.result?.id, 'string')
      t.is(validate(c.post.returns, result.result).result, 'pass')
    }))

  test('manageFields id: id is saved and added to result', ExpectGood(
    (db, c) => db.post(c.post, { sub: 'userId' }, 'itemId', generate(c.post.arguments)),
    (result, t) => { t.is(result.result?.id, 'itemId') }))

  return testsToRun
}

contractCollection().map(x => runTestArray(x, getTests()))
