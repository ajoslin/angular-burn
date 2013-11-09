angular-burn
------------

Why this instead of angularFire?  It works the same way, automatic synchronization of changes.

angularFire needs some refactoring I think to make it unit testable and more stable.

So I refactored, with unit tests, and use recursive listeners for firebase changes.  So now if a deep object changes, only the exact change will be set on the client side.

Also I want to only send exact changes up to Firebase - this will require taking watchCollection from angular core and modding it a bit to tell us exact changes.

**TODO**

* in Burn#destroy(), remove recursively all existing listeners (see if we can figure out way to do this better than just keeping all refs that are listened to in an array)
* finish unit tests for firebase to angular sync
* take watchCollection from angular core and make it tell us exact changes, then send those up
