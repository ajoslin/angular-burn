angular-burn
------------

Why this instead of angularFire? 

I used angularFire in an app and had some problems with it:

1. Every time you change anything on the object, it sent the whole object back up.  The biggest issue with this was my firebase's security rules. Consider if I have /users/{id} as an angularFire object. I update myUser.photo, and angularFire tries to save - but it tries to save the whole object, and I have a security rule that doesn't allow writing on an existing /users/{id}.  A fix would be to only send pertinent changes up. 
1. Huge bandwidth usage, due to 1
1. angularFire is not unit-tested or anywhere near testable, which just makes me scared to use it in production

- angular-burn has the ability to 'filter' which values you get back from Firebase. For example, if you have a user and you only want to download his friends, your data might look like the following:
```js
"friends": {
  "bob": {
    "joe": true,
    "jane": true,
    "bob": true
  }
},
"user:": {
  "bob": {...},
  "joe": {...},
  "jane": {...},
  "sarah": {...},
  "sally": {...}
}
```
Now as you see, bob has joe and jane as friends, and himself as a friend.  We only want to download the users data for Bob, Joe, and Jane, if we are logged in as Bob.  This is now as simple as:
```js
var usersBurn = new Burn({
  scope: $scope,
  name: 'users',
  ref: new Firebase('my.firebaseio.com/users'),
  filterRef: new Firebase('my.firebaseio.com/friends/bob')
});
```
Now, $scope.users will always represent only the user objects of any userIds found in friends/bob:  $scope.users will add and remove keys based on changes in friends/bob.

- angular-burn will figure out exactly which client side changes happen in a deep or nested object/array, and only send those changes up with ref.set().
- angular-burn will find out exactly which changes happen remotely by adding child listeners, and only change the needed attributes in the client-side object.
- angular-burn allows the type of the object at the root to change: you could have an object which goes from array to being removed to an object to a number to a string, and it will work as intended
- angular-burn has unit tests and is built for testing and modularity


Development
-----------

- `bower install`
- `npm install`
- `karma start` to start test server (requires karma)
- `grunt` to concat and wrap file in closure

To Release
----------

- Set new version by editing bower.json, then run `grunt shell:release`. Review changes, refine changelog if desired, amend commit, and then `git push --tags`.
