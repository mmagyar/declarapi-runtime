# declarapi-runtime


Runtime dependencies of [declarapi](https://declarapi.com)

## This package provides all runtime functionality:

### Validation the incoming and outgoing data to the specified schema

### Catch all exceptions in the handlers and turn them into error messages

 ### Provide a database communication layer
- Elasticsearch
- High level key-value store that is compatible with multiple backend solutions
 - - In memory key value store (recommended only for development and testing)
 - - Cloudflare workers KV via the HTTP API and from a worker via a custom switch
 - - TODO - Redis

### It is fully independent of the server

 it does not relay on any nodejs functionality so it can run as
 a service worker (cloudflare workers serverless)
 and future plans contain making it Deno compatible.

### It is fully independent of the communication method

 it can be used with HTTP for a REST api, JSON-RPC, web sockets, etc.
 The handling methods return an object containing either the result of the operation or a descriptive error, along with the status code.

 ### This is an ES6 module package

The default usage of this package are ES6 modules,
 although there is a commonjs included, under `cjs` folder,
 it is not very usable since it is using a package that is ES6
 first. An import rewrite would be needed for cjs build to work correctly.

# testing
Aiming for 100% test coverage, since any uncovered code may be dead code.

This project uses Ava for testing, with C8 for code coverage

Ava was chosen over other frameworks
 because it works with e6 modules without any transpilation
 (ie: it tests the code that will actually run in production)
 and that it has no magic, tests are just plain code.
It makes it easy to reuse test code, with different backend providers,
since they should all work the mostly the same.

For integration type tests, that relay on a real database,
the best course of action is to execute each test on a different
database / index / prefix so there is absolutely no crosstalk between
tests, and they can run in parallel to make test run much quicker.
