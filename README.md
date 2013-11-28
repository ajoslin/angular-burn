angular-burn
------------

Why this instead of angularFire? 

I used angularFire in an app and had some problems with it:

1. Every time you change anything on the object, it sent the whole object back up.  The biggest issue with this was security - eg if I have /users/{id} as an angularFire object. I update myUser.photo, and angularFire tries to save - but it tries to save the whole object, and I have a security rule that doesn't allow writing on an existing /users/{id}.  A fix would be to only send pertinent changes up. 
1. Huge bandwidth usage, due to 1
1. angularFire is not unit-tested or anywhere near testable, which just makes me scared to use it in production

- angular-burn will figure out exactly which client side changes happen in a deep or nested object/array, and only send those changes up with ref.set().
- angular-burn will find out exactly which changes happen remotely by adding child listeners, and only change the needed attributes in the client-side object.
- angular-burn allows the type of the object at the root to change: you could have an object which goes from array to being removed to an object to a number to a string, and it will work as intended
- angular-burn has unit tests and is built for testing and modularity

I hope to get this version merged into Firebase core, it is a much better solution.

Development
-----------

- `bower install`
- `npm install`
- `karma start` to start test server (requires karma)
- `grunt` to concat and wrap file in closure
