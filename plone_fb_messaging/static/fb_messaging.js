

var app = angular.module('messaging', ['firebase']);

var url = 'https://plone-presence.firebaseio-demo.com/';

app.controller('MessagingController', ['$scope', '$timeout', 'angularFire', '$q',
    function($scope, $timeout, angularFire, $q) {

        $scope.username = 'Anonymous';

        // Log me in.
        // 
        //var dataRef = new Firebase(url);
        //
        //dataRef.auth(authToken, function(error, result) {
        //    if (error) {
        //        throw new Error("Login Failed! \n" + error);
        //    }
        //});

        var onlineRef = new Firebase(url + 'presence');
        var connectedRef = new Firebase(url + '.info/connected');

        connectedRef.on('value', function(snap) {
            if (snap.val() === true) {
                // We're connected (or reconnected)!  Set up our presence state and
                // tell the server to set a timestamp when we leave.
                var userRef = onlineRef.child($scope.username);
                var connRef = userRef.child('online').push(1);
                connRef.onDisconnect().remove();
                userRef.child('logout').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
            }
        });

        // bind the data so we can display who is logged in
        var promise = angularFire(onlineRef, $scope, 'users', {});

    }

]);



