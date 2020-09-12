[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
![Latest version published](https://github.com/mmagyar/declarapi-runtime/workflows/Automatic%20package%20publish/badge.svg?branch=master)
![Build](https://github.com/mmagyar/declarapi-runtime/workflows/Automatic%20test%20run/badge.svg?branch=master)
![Code coverage](https://img.shields.io/codecov/c/github/mmagyar/declarapi-runtime)

# [declarapi-runtime](https://github.com/mmagyar/declarapi-runtime)


Runtime dependencies of [declarapi](https://declarapi.com)

This package is being made to service [declarapi](https://declarapi.com),
but will work without out.

Using it without the generated contracts is possible,
but in that case the correctness of the contracts are not guaranteed.

## This package provides all runtime functionality:

### Validation the incoming and outgoing data to the specified schema

Using the [yaschva](https://yaschva.com) validator,
that provides descriptive error messages.

### Catch all exceptions in the handlers and turn them into error messages

If the thrown object has a status, statusCode or code field,
with a number in it that is between 400 and 599,
it will be used as the response code.

Although, if there is an anticipated error,
 it's better to return a `HandleErrorResponse` object

### Handle authorization

Role based access to the api endpoint is handled by
the `process`-ed handle.

Record based access (that depends on the createdBy field),
is handled by the data access layer.
If a manual backend implementation is used,
this must be taken care of in the custom implementation.

#### NOTICE
Authentication must be handled by your app, the user information must be provided to the runtime.


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

## Testing
Aiming for 100% test coverage, since any uncovered code may be dead code.
Without a test for that line, the author of the code may not have though
it through, writing a test for it makes sure that the code is fully understood.

This project uses Ava for testing, with C8 for code coverage

Ava was chosen over other frameworks
 because it works with e6 modules without any transpilation
 (ie: it tests the code that will actually run in production)
 and that it has no magic, tests are just plain code.
It makes it easy to reuse test code, with different backend providers,
since they should all work the mostly the same.
Ava also makes it easy to run each test multiple times,
which can be very useful when testing with randomly generated data.

For integration type tests, that relay on a real database,
the best course of action is to execute each test on a different
database / index / prefix so there is absolutely no crosstalk between
tests, and they can run in parallel to make test run much quicker.

If a test breaks in this repo,
always look at the post
[backendPost.spec.ts](src/backendTests/backendPost.spec.ts) first,
since the other test relay on it's behavior to correctly execute.


## Roadmap / plans / TODO
[Roadmap / plans / TODO can be found in TODO.md](TODO.md)
