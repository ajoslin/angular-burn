angular-burn
------------

- [Quick Start](#quick-start)
- [Documentation](#documentation)

(I would still recommend angularFire for most apps unless you are ready to maybe find some bugs!)

- angular-burn has the ability to 'filter' which values you get back from Firebase. For example, if you have a user and you only want to download his friends.  See [filtering data from server](#filtering-data-from-server) for more information.
- angular-burn will figure out exactly which client side changes happen in a deep or nested object/array, and only send those changes up with ref.set().
- angular-burn will find out exactly which changes happen remotely by adding child listeners, and only change the needed attributes in the client-side object.

Quick Start
-----------

```sh
bower install angular-burn
```
```html
<script src="angular.js"></script>
<script src="angular-burn.js"></script>
```
```js
var myApp = angular.module('myApp', ['burnbase']);
myApp.controller('MyCtrl', function($scope, Burn) {
  var myBurn = Burn({
    scope: $scope,
    name: 'users',
    ref: new Firebase('http://my.firebaseio.com/users')
  });
  myBurn.ready().then(function() {
    $scope.users.bob.name = 'Bob Johnson'; //synced with Firebase
  });
});
```
Then manipulate any property anywhere on $scope.users, and it will sync changes to Firebase.

Documentation
-------------

<a id="docs-main"></a>
#### `var myBurn = Burn(options)`

`options` is an object with the following fields:

* `scope` `{object}` - The parent object for binding firebase data. Does *not* have to be an actual angular scope.
* `name` `{string}` - The key to bind data to. Eg if name is 'users', data will be found in `scope.users`.
* `ref` `{string|firebaseRef}` - The ref - or url to create a ref - that we will get data from.
* `filterRef` `{string|firebaseRef}` (optional) - If defined, lets us only get *some* of the data back from `options.ref`. For example, if we have hundreds of users but we only want to pull down the logged in user's friends.  See [filtering data from server](#filtering-data-from-server) for more information on this.

Returns a `Burn` instance, with the following properties:

* `destroy` `{function}` - Call this to destroy the burn.  This is automatically called when `options.scope` is destroyed if `options.scope` is an angular scope object.
* `isReady` `{boolean}` - Whether the burn is 'ready': this will resolve once Firebase gives us the initial value of the data.
* `ready` `{function}` - Returns a promise that will be resolved once the burn is ready.

Manipulate any value anywhere in `options.scope[name]`, and it will push that exact change up to Firebase.  Additionally, any change from Firebsae will change only the relevant sub-data on the client.

Filtering Data From Server
--------------------------

- You can use `options.filterRef` to only download a subset of a huge data-set.  For example, say your user is logged in as Bob.  You want to download and Burn only him and his friends out of hundreds of users.

Let's say your Firebase data living on the server looked like this:
```js
"friends": {
  "bob": {
    "joe": true,
    "jane": true,
    "bob": true
  }
},
"users": {
  "bob": {...},
  "joe": {...},
  "jane": {...},
  "sarah": {...},
  "sally": {...}
}
```

So, you want to download only the users where `/friends/bob/{userId}` is true.  You can do this very simply:
```js
var usersBurn = new Burn({
  scope: $scope,
  name: 'users',
  ref: new Firebase('my.firebaseio.com/users'),
  filterRef: new Firebase('my.firebaseio.com/friends/bob')
});
```

Now `$scope.users` will represent only the keys in `/users` that match keys in `/friends/bob`.  Any changes to `/friends/bob` will add and remove users from `$scope.users`.

Development
-----------

- `bower install`
- `npm install`
- `karma start` to start test server (requires karma)
- `grunt` to concat and wrap file in closure

To Release
----------

- Set new version by editing bower.json, then run `grunt shell:release`. Review changes, refine changelog if desired, amend commit, and then `git push --tags`.
