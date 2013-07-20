var privateChat;
var app = angular.module('messaging', ['firebase']);

var url = 'https://sushain97.firebaseio.com/';
var onlineRef = new Firebase(url + 'presence');
var connectedRef = new Firebase(url + '.info/connected');
var windows = new Array();
var $el = $('#messagesDiv');

app.controller('MessagingController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {
		$scope.usernameRegexp = new RegExp('[a-zA-Z0-9.-_]+');
		var username = $.cookie('username');
		if(username === undefined) {
			var anonUser = 'Anonymous' + Math.floor(Math.random() * 111);
			$scope.username = anonUser; //Very bad things happen if two people have the same username
			$.cookie('username', anonUser);
		}
		else if(username.search($scope.usernameRegexp) === 0)
			$scope.username = username;

		var target = getParameterByName('user');
		privateChat = target !== '';
		$scope.heading = privateChat ? 'Private Chat with ' + target : 'Public Chat';
		
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
                connRef.onDisconnect().remove();
                userRef.child('logout').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
				userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
            }
        });

        var promise = angularFire(onlineRef, $scope, 'users', {}); // bind the data so we can display who is logged in

        $scope.messages = angularFireCollection(url + '/messages', function() {
            $timeout(function() {
                $el[0].scrollTop = $el[0].scrollHeight;
            });
        });
		
        $scope.addMessage = function() {
			var userRef = onlineRef.child($scope.username);
			userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
			
			var from = $scope.username;
			var msg = encodeHTML($scope.message);
			if($scope.message.indexOf('/') === 0)
				commandHandler($scope, $scope.message);
			else {
				if(!privateChat) {
					$scope.messages.add({sender: from, content: msg, private: false, type: 'public'}, scrollWindow($el));
					$scope.message = '';
				}
				else if(privateChat) {
					var target = getParameterByName('user');
					$scope.messages.add({sender: from, content: msg, private: true, privateChat: true, recipient: target, type: 'privateChat'}, scrollWindow($el));
					$scope.message = '';
				}
				$scope.helpClass = 'hidden';
			}
			
            // prevent double click warning for this form
            // (this is a hack needed for Plone)
            //$root.find('input[value="Send"]')
            //    .removeClass('submitting');
        };
		
        $scope.updateUsername = function() {
			if($('#username').val() !== '') {
				var userRef = onlineRef.child($.cookie('username'));
				var connRef = userRef.child('online').remove();
				userRef.child('logout').set(Firebase.ServerValue.TIMESTAMP);
				$.cookie('username', $('#username').val());
				
				userRef = onlineRef.child($scope.username);
				connRef = userRef.child('online').push(1);
				connRef.onDisconnect().remove();
				userRef.child('logout').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
			}
			else
				$scope.username = $.cookie('username');
        };
		
		$scope.privateChat = function($event) {
			commandHandler($scope, '/query ' + $($event.target).data('username'));
		}
	}
]);

function commandHandler($scope, msg) {
	var delim = msg.indexOf(' ');
	var command = delim !== -1 ? msg.substring(1, delim) : msg.substr(1);
	var username = $scope.username;
	var usernameRegexp = $scope.usernameRegexp.source;
	var privateChatUser = getParameterByName('user');
	
	switch(command) {
		case 'msg': {
			if(msg.search('/msg\\s' + usernameRegexp + '\\s.+') != 0) {
				$scope.helpClass = 'error';
				$scope.help = 'Bad syntax - /msg {target username} {message}';
			}
			else {
				var delim2 = msg.indexOf(' ', delim + 1);
				var target = msg.substring(delim + 1, delim2);
				var message = encodeHTML(msg.substr(delim2 + 1));
				
				$scope.messages.add({sender: username, content: message, private: true, type: 'private', recipient: target}, scrollWindow($el));
				$scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username, content: 'private message sent to <em>' + target + '</em>: "' + message + '"', 
					private: true, privateChat: privateChat, type: 'server'}, scrollWindow($el));
				$scope.helpClass = 'info'
				$scope.help = 'Message sent to ' + target;
			}
			break;
		}
		case 'query' : {
			if(msg.search('/query\\s' + usernameRegexp + '$') != 0) {
				$scope.helpClass = 'error';
				$scope.help = 'Bad syntax - /query {target username}';
			}
			else {
				var target = msg.substr(delim + 1);
				if(target !== $scope.username) {
					windows.push(target);
					$.cookie('windows', escape(windows.join(',')));
					window.open(privateWindowURL(target), 'Private chat with ' + target, 'titlebar=0,toolbar=0,width=400,height=700', false);
					$scope.helpClass = 'info';
					$scope.help = 'Opened private chat window with ' + target; //TODO: Make evident if user is offline inside window
				}
				else {
					$scope.helpClass = 'error';
					$scope.help = 'You cannot private chat with yourself';
				}
			}
			break;
		}
		case 'me': {
			var action = encodeHTML(msg.substr(delim + 1));
			if(msg.search('/me\\s.+') != 0) {
				$scope.helpClass = 'error';
				$scope.help = 'Bad syntax - /me {action}';
			}
			else {
				$scope.messages.add({sender: username, content: action, private: privateChat, type: 'action', privateChat: privateChat, recipient: privateChatUser}, scrollWindow($el));
				$scope.helpClass = 'hidden';
			}
			break;
		}
		case 'whois': {
			if(msg.search('/whois\\s' + usernameRegexp + '$') != 0) {
				$scope.helpClass = 'error';
				$scope.help = 'Bad syntax - /whois {target username}';
			}
			else {
				var target = msg.substr(delim + 1);
				function whoisResult(result) {
					$scope.helpClass = result ? 'info' : 'error';
					$scope.help = 'Whois query ' + (result ? 'successful' : 'unsuccessful');
				}
				
				onlineRef.child(target).once('value', function(dataSnapshot) {
					if(dataSnapshot.hasChild('lastActive')) {
						$scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username,
							content: '<strong>whois</strong>: <em>' + target + '</em> is online and was last active ' + new Date(dataSnapshot.child('lastActive').val()).toString(),
							private: true, privateChat: privateChat, type: 'server'}, scrollWindow($el));
						whoisResult(true);
					}
					else if(dataSnapshot.hasChild('logout')) {
						$scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username,
							content: '<strong>whois</strong>: <em>' + target + '</em> is offline and was last seen ' + new Date(dataSnapshot.child('logout').val()).toString(), 
							private: true, privateChat: privateChat, type: 'server'}, scrollWindow($el));
						whoisResult(true);
					}
					else
						whoisResult(false);
				}, whoisResult);
			}
			break;
		} 
		case 'time': {
			if(msg.search('/time$') != 0) {
				$scope.helpClass = 'error';
				$scope.help = 'Bad syntax - /time';
			}
			else {
				$scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username, content: '<strong>current time</strong>: ' + new Date().toString(), 
					private: true, privateChat: privateChat, type: 'server'}, scrollWindow($el));
				$scope.helpClass = 'hidden';
			}
			break;
		} //TODO: Add more commands if desired
		default : {
			$scope.helpClass = 'error';
			$scope.help = 'Unrecognized command: ' + msg;
		}
	}
	$scope.message = '';
}

app.filter('onlineFilter', function() {
	return function(users, $scope) {
		var result = new Object();
		for(username in users) {
			var user = users[username];
			if(user.online)
				result[username] = user;
		}
		$scope.numUsers = ' (' + Object.keys(result).length + ')';
		return result;
	}
});

app.filter('messageFilter', function() {
	return function(messages, $scope) {
		var result = [];
		var message;
		var username = $scope.username;
		for (var i = 0; i < messages.length; i++) { //TODO: don't show all messages
			message = messages[i];
			if(privateChat) {
				var target = getParameterByName('user');
				if(message.type === 'server' && message.recipient === target && message.privateChat)
					result.push(message); //Message only seen in private chat window that it was sent in
				else if(message.type !== 'server' && message.privateChat && (target === message.sender || target === message.recipient) && (message.recipient === username || message.sender === username))
					result.push(message); //Message only seen in private chat window
			}
			else {
				if(!message.privateChat && !message.private)
					result.push(message); //Everyone sees the message
				else if(!message.privateChat && message.recipient === username)
					result.push(message); //Message seen only by person it was privately sent to
				else if(message.privateChat && message.recipient === username && windows.indexOf(message.sender) === -1 && message.type !== 'server') { //Open new private window since we don't have one yet
					var sender = message.sender;
					windows.push(sender);
					$.cookie('windows', escape(windows.join(',')));
					window.open(privateWindowURL(sender), 'Private chat with ' + sender, 'titlebar=0,toolbar=0,width=400,height=700', false);
					$scope.helpClass = 'info';
					$scope.help = sender + ' initiated a private chat with you';
				}
			}
		}
		return result;
	}
});

function privateWindowURL(sender) {
	return '//' + location.host + location.pathname + '?user=' + encodeURIComponent(sender);
}

function scrollWindow($el) {
	$el.animate({scrollTop: $el[0].scrollHeight}, 500);
}

app.directive('contenteditable', function() {
	return {
		restrict: 'A',
		require: '?ngModel',
		link: function(scope, element, attrs, ngModel) {
			if(!ngModel) return;

			ngModel.$render = function() {
				element.html(ngModel.$viewValue || '');
			};

			element.bind('blur', function() {
				if(ngModel.$modelValue !== $.trim(element.html()))
					scope.$apply(editMessage);
			});

			function editMessage() {
				var newContent = $.trim(element.html());
				var id = element.closest('div').next().html();
				if(newContent !== '{{message.content}}' && id !== undefined && id !== '{{message.$id}}') {
					var messages = scope.messages;
					for (var i = 0; i < scope.messages.length; i++) {
						if(scope.messages[i].$id === id) {
							if(newContent !== '') {
								scope.messages[i].content = newContent;
								scope.messages.update(scope.messages[i]);
							}
							else
								scope.messages.remove(scope.messages[i]);
							break;
						}
					}
				}
			}
		}
	};
});

//from http://stackoverflow.com/a/1219983/1266600
function encodeHTML(value){
  //create a in-memory div, set it's inner text(which jQuery automatically encodes)
  //then grab the encoded contents back out.  The div never exists on the page.
  return $('<div/>').text(value).html();
}

//from http://stackoverflow.com/a/901144/1266600
function getParameterByName(name) { 
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}