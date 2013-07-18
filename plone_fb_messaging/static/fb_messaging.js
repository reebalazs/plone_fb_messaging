var privateChat;
var app = angular.module('messaging', ['firebase']);

var url = 'https://sushain97.firebaseio.com/';
var onlineRef = new Firebase(url + 'presence');
var connectedRef = new Firebase(url + '.info/connected');
var windows = new Array();

app.controller('MessagingController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {
		var username = $.cookie('username');
		if(username === undefined) {
			var anonUser = 'Anonymous' + Math.floor(Math.random() * 111);
			$scope.username = anonUser; //Very bad things happen if two people have the same username
			$.cookie('username', anonUser);
		}
		else
			$scope.username = username;
			
        var $el = $('#messagesDiv');
		privateChat = getParameterByName('user') !== '';
		
		var windowCookie = $.cookie('windows');
		if(windowCookie !== undefined)
			windows = unescape(windowCookie).split(',');
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

        connectedRef.on('value', function(snap) { 
            if(snap.val() === true) {
                // We're connected (or reconnected)!  Set up our presence state and
                // tell the server to set a timestamp when we leave.
                var userRef = onlineRef.child($scope.username);
                var connRef = userRef.child('online').push(1);
                connRef.onDisconnect().remove(); //TODO: Check if the multiple instances will mess this up
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
            $timeout(function() {
                $el[0].scrollTop = $el[0].scrollHeight;
            });
        });

        $scope.addMessage = function() {
			if($scope.message.indexOf('/') === 0)
				commandHandler($scope, $scope.message);
			else if(!privateChat) {
				$scope.messages.add({from: $scope.username, content: $scope.message, private: false}, function() {
					$el.animate({scrollTop: $el[0].scrollHeight}, 500);
				});
				$scope.message = '';
			}
			else if(privateChat){
				var target = getParameterByName('user');
				$scope.messages.add({from: $scope.username, content: $scope.message, private: true, privateChat: true, recipient: target}, function() {
					$el.animate({scrollTop: $el[0].scrollHeight}, 500);
				});
				$scope.message = '';
			}

            // prevent double click warning for this form
            // (this is a hack needed for Plone)
            //$root.find('input[value="Send"]')
            //    .removeClass('submitting');
        };
		
        $scope.updateUsername = function() {
			var userRef = onlineRef.child($.cookie('username'));
			var connRef = userRef.child('online').remove();
			userRef.child('logout').set(Firebase.ServerValue.TIMESTAMP);
			$.cookie('username', $('#username').val()); //TODO: Encode/escape username
			
			userRef = onlineRef.child($scope.username);
			connRef = userRef.child('online').push(1);
			connRef.onDisconnect().remove();
			userRef.child('logout').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
        };
		
		$scope.privateChat = function($event) {
			commandHandler($scope, '/query ' + $($event.target).data('username'));
		}
	}
]);

function commandHandler($scope, msg) {
	var delim = msg.indexOf(' ');
	var command = msg.substring(1, delim);
	var username = $scope.username;
	
	switch(command) {
		case 'msg': {
			if(msg.search('/msg [a-zA-Z0-9]+ .+') != 0) { //TODO: Use better regex based on username requirements
				$scope.help = 'Bad syntax - /msg {target username} {message}';
				$scope.helpClass = 'error';
			}
			else {
				var delim2 = msg.indexOf(' ', delim + 1);
				var target = msg.substring(delim + 1, delim2);
				var message = msg.substr(delim2 + 1);
				
				$scope.messages.add({from: username, content: username + ' said "' + message + '" privately', private: true, recipient: target}); //TODO: Improve styling
				$scope.messages.add({from: username, content: 'message sent to ' + target, private: true, recipient: username}); //TODO: Improve styling
				$scope.helpClass = 'info';
				$scope.help = 'Message sent to ' + target;
			}
			break;
		}
		case 'query' : {
			if(msg.search('/query [a-zA-Z0-9]+') != 0) { //TODO: Use better regex based on username requirements
				$scope.help = 'Bad syntax - /query {target username}';
				$scope.helpClass = 'error';
			}
			else {
				var target = msg.substr(delim + 1);
				if(target !== $scope.username && windows.indexOf(target) === -1) {
					windows.push(target);
					$.cookie('window', escape(windows.join(',')));
					window.open(document.URL + '?user=' + encodeURIComponent(target), 'Private chat with ' + target, 'titlebar=0,toolbar=0,width=400,height=600', false); //TODO: Adjust window properties
					$scope.helpClass = 'info';
					$scope.help = 'Opened private chat window with ' + target;
				}
			}
			break;
		} //TODO: Add more commands
		default : {
			$scope.helpClass = 'error';
			$scope.help = 'Unrecognized command: ' + msg;
		}
	}
	$scope.message = '';
}

app.filter('online', function() {
	return function(users) {
		var result = new Object();
		for(username in users) {
			var user = users[username];
			if(user.online)
				result[username] = user;
		}
		return result;
	}
});

app.filter('messageFilter', function() {
	return function(messages, $scope) {
		var result = [];
		var message;
		for (var i = 0; i < messages.length; i++) { //TODO: don't show all messages
			message = messages[i];
			if(privateChat) {
				var target = getParameterByName('user');
				if((target === message.from || target === message.recipient) && (message.recipient === $scope.username || message.from === $scope.username) && message.privateChat)
					result.push(message); //Message only seen in private chat window
			}
			else {
				if(!message.private)
					result.push(message); //Everyone sees the message
				else if(!message.privateChat && message.recipient === $scope.username)
					result.push(message); //Message seen only by person it was privately sent to //TODO: style differently
				else if(message.privateChat && message.recipient === $scope.username && windows.indexOf(message.from) === -1) { //Open new private window since we don't have one yet
					var sender = message.from;
					windows.push(sender);
					$.cookie('window', escape(windows.join(',')));
					window.open(document.URL + '?user=' + sender, 'Private chat with ' + sender, 'titlebar=0,toolbar=0,width=400,height=600', false); //TODO: Adjust window properties
					$scope.helpClass = 'info';
					$scope.help = sender + ' initiated a private chat with you';
				}
			}
		}
		return result;
	}
});

//from http://stackoverflow.com/a/901144/1266600
function getParameterByName(name) { 
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}