# declarapi-runtime


Runtime dependencies of [declarapi](https://declarapi.com)
The default usage of this package are ES6 modules,
 although there is a commonjs included, under `cjs` folder,
 it is not very usable since it is using a package that is ES6
 first. An import rewrite would be needed for cjs build to work correctly.

# TEST
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
