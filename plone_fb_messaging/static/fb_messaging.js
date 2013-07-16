

var app = angular.module('messaging', ['firebase']);

var url = 'https://plone-presence.firebaseio-demo.com/';

app.controller('MessagingController', ['$scope', '$timeout', 'angularFire',
        'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {

        $scope.username = 'Anonymous';
        var $el = $('#messagesDiv');

        // Log me in.
        // 
        //var dataRef = new Firebase(url);
        //
        //dataRef.auth(authToken, function(error, result) {
        //    if (error) {
        //        throw new Error("Login Failed! \n" + error);
        //    }
        //});

        //
        // Presence
        //

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

        //
        // Chat
        // (this should probably go to its separate controller)
        //
        

        $scope.messages = angularFireCollection(url + '/messages', function() {
            $timeout(function () {
                $el.scrollTop = $el.scrollHeight;
            });
        });

        $scope.addMessage = function () {
            $scope.messages.add({from: $scope.username, content: $scope.message}, function() {
                $el.scrollTop = $el.scrollHeight;
            });
            $scope.message = "";

            // prevent double click warning for this form
            // (this is a hack needed for Plone)
            //$root.find('input[value="Send"]')
            //    .removeClass('submitting');

        };

        $scope.updateUsername = function () {
            // save this to a cookie
            //document.cookie = $scope.USERNAME_COOKIE +
            //    "=" + escape($scope.username) + "; path=/";
        };

    }

]);



