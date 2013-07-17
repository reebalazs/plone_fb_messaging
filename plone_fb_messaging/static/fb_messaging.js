var app = angular.module('messaging', ['firebase']);

var url = 'https://plone-presence.firebaseio-demo.com/';

app.controller('MessagingController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {
		var username = $.cookie('username');
        $scope.username = username === undefined ? 'Anonymous' : username; //Runs before user has chance to enter username, so we can't just read input
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
                $el[0].scrollTop = $el[0].scrollHeight;
            }); //Why is this wrapped in a 0 ms timeout if it's already in a callback?
        });

        $scope.addMessage = function () {
            $scope.messages.add({from: $scope.username, content: $scope.message}, function() {
                $el.animate({scrollTop: $el[0].scrollHeight}, 500);
            });
            $scope.message = '';

            // prevent double click warning for this form
            // (this is a hack needed for Plone)
            //$root.find('input[value="Send"]')
            //    .removeClass('submitting');
        };

        $scope.updateUsername = function () {
			$.cookie('username', $('#username').val());
        };
	}
]);

app.filter('online', function() {
	return function(users) {
		var result = new Object();
		$.each(users, function(name, user) {
			if(user.online)
				result[name] = user;
		});
		return result;
	}
});