TODO
====

Interface tweaks
----------------
- Change output of delete backend function, right now there is no output,
  and an error is returned even if only a single id had a permission error.
  

Features
--------
- Add option to create a mock API based on the schema
- Redis backend

Testing
-------
- Write generic testing facility for data connector, so all data connectors can be tested with a single test suit (in progress)
- Write test for get paging


low prio:
- Make cjs use cjs version of it's own imports
