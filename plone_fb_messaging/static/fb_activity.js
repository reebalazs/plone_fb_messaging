var app = angular.module('activityStream', ['firebase']);
var firebaseURL = 'https://sushain.firebaseio.com/';
var onlineRef = new Firebase(firebaseURL + 'presence');
var connectedRef = new Firebase(firebaseURL + '.info/connected');

app.controller('ActivityStreamController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {
		$scope.usernameRegexp = new RegExp('[a-zA-Z0-9.-_]+');
		var username = $.cookie('username');
		if(username === undefined || username.search($scope.usernameRegexp) !== 0) {
			var anonUser = 'Anonymous' + Math.floor(Math.random() * 111);
			$scope.username = anonUser; //Very bad things happen if two people have the same username
			$.cookie('username', anonUser);
		}
		else if(username.search($scope.usernameRegexp) === 0)
			$scope.username = username;
			
		connectedRef.on('value', function(snap) {
            if(snap.val() === true) {
                userRef = onlineRef.child($scope.username);
                var connRef = userRef.child('online').push(1);
				userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
				userRef.child('online').onDisconnect().remove();
				userRef.child('logout').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
            }
        });
	
		$scope.activities = angularFireCollection(firebaseURL + 'activity', function() {
            $scope.scroll();
        });
		
		$scope.scroll = function() {
			$timeout(function() {
                var $el = $('#activitiesDiv');
				$el[0].scrollTop = $el[0].scrollHeight;
            });
		};
		
		$scope.markSeen = function() {
			userRef.child('lastSeen').set(Firebase.ServerValue.TIMESTAMP);
			$.cookie('lastSeen', Date.now()); //This is a temporary workaround since accessing firebase inside a filter is proving to be difficult
		};
		
		$scope.updateUsername = function() {
			if($('#username').val() !== '') {
				var oldUserRef = onlineRef.child($.cookie('username'));
				var connRef = oldUserRef.child('online').remove();
				oldUserRef.child('logout').set(Firebase.ServerValue.TIMESTAMP);
				oldUserRef.child('online').remove();
				$.cookie('username', $('#username').val());
				
				userRef = onlineRef.child($scope.username);
				connRef = userRef.child('online').push(1);
			}
			else
				$scope.username = $.cookie('username');
        };
	}
]);

app.filter('activityFilter', function() {
	return function(activities, $scope) {
		var result = [];
		var lastSeen = $.cookie('lastSeen'); //This is a temporary workaround since accessing firebase inside a filter is proving to be difficult
		if(lastSeen === undefined) lastSeen = -1; //-1 will effectively show all activity
		
		for(var i = 0; i < activities.length; i++) {
			var activity = activities[i];
			if(activity.time > lastSeen)
				result.push(activity);
		};
		return result;
	}
});

app.filter('millisToReadableDate', function() {
	return function(date) {
		return new Date(date).toString();
	}
});

function scrollWindow($el) {
	$el.animate({scrollTop: $el[0].scrollHeight}, 500);
}