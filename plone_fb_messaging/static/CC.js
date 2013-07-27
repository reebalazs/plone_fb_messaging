var app = angular.module('commandCentral', ['firebase']);
var firebaseURL = 'https://sushain.firebaseio.com/';

var onlineRef;
var connectedRef;
var userRef;
// XXX probably should move these in the controllers.
// Workaround for now...
//
jQuery(function () {
    onlineRef = new Firebase(firebaseURL + 'presence');
    connectedRef = new Firebase(firebaseURL + '.info/connected');
});

app.config(['$routeProvider', function($routeProvider) {
  $routeProvider.
      when('/', {templateUrl: 'CC.html', controller: 'CommandCentralController'}).
      when('/activity', {templateUrl: 'fb_activity.html', controller: 'ActivityStreamController'}).
      when('/messaging', {templateUrl: 'fb_messaging.html', controller: 'MessagingController'}).
      otherwise({redirectTo: '/'});
}]);

app.controller('CommandCentralController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {
    }
]);

app.controller('ActivityStreamController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q', '$route',
    function($scope, $timeout, angularFire, angularFireCollection, $q, $route) {
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
    
        $scope.scroll = function() {
            $timeout(function() {
                var $el = $('#activitiesDiv');
                if($el.length) $el[0].scrollTop = $el[0].scrollHeight;
            });
        };
        
        $scope.getLastSeen = function() {
            var deferred = $q.defer();
            onlineRef.child($scope.username).child('lastSeen').on('value', function(dataSnapshot) {
                deferred.resolve(dataSnapshot.val());
                if(!$scope.$$phase) $scope.$apply();  //needed for the resolve to be processed
            });
            return deferred.promise;
        };
        
        onlineRef.child($scope.username).child('lastSeen').on('value', function(dataSnapshot) {
            $scope.lastSeen = dataSnapshot.val();
        });

        $scope.activities = [];
        var promise = $scope.getLastSeen();
        promise.then(function(lastSeen) {
            $scope.lastSeen = lastSeen;
            $scope.activities = angularFireCollection(firebaseURL + 'activity', function() {
                $scope.scroll();
            });
        });
        
        $scope.markSeen = function() {
            userRef.child('lastSeen').set(Firebase.ServerValue.TIMESTAMP);
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
            location.reload(); //username will never change like this in deployment anyways
        };

        /*This will ensure that if an event expires while displayed on the activity stream page, it will dissapear.
          However, this will result in recurring JS calls which may be undesirable and a flicker at every iteration.
          Comment out the setInterval call to disable this functionality */
        setInterval(refresh, 10000);
        function refresh() {
            $scope.activities = angularFireCollection(firebaseURL + 'activity', function() {
                $scope.scroll();
                if(!$scope.$$phase) $scope.$apply();
            });
        }
    }
]);

app.filter('activityFilter', function() {
    return function(activities, $scope) {
        var result = [];
        var lastSeen = $scope.lastSeen === undefined ? -1 : $scope.lastSeen; //-1 will effectively show all activity

        for(var i = 0; i < activities.length; i++) {
            var activity = activities[i];
            if(activity.time > lastSeen && activity.expiration > Date.now())
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

app.filter('timeFromNow', function() {
    return function(date) {
        return (date - Date.now())/1000 + ' seconds'; //This can be easily improved to increase verbosity
    }
});

var privateChat;
var privateChatUser;

app.controller('MessagingController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$route', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q, $route) {
        $scope.usernameRegexp = new RegExp('[a-zA-Z0-9.-_]+');
        var username = $.cookie('username');
        if(username === undefined || username.search($scope.usernameRegexp) !== 0) {
            var anonUser = 'Anonymous' + Math.floor(Math.random() * 111);
            $scope.username = anonUser; //Very bad things happen if two people have the same username
            $.cookie('username', anonUser);
        }
        else if(username.search($scope.usernameRegexp) === 0)
            $scope.username = username;

        privateChatUser = '';
        privateChat = false;
        $scope.privateChatUser = privateChatUser;
        $scope.heading = 'Public Chat';

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
                userRef = onlineRef.child($scope.username);
                var connRef = userRef.child('online').push(1);
                userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
                userRef.child('online').onDisconnect().remove();
                userRef.child('logout').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
            }
        });

        var promise = angularFire(onlineRef, $scope, 'users', {}); // bind the data so we can display who is logged in

        $scope.messages = angularFireCollection(firebaseURL + '/messages', function() {
            $scope.scroll();
        });
        
        $scope.rooms = angularFireCollection(firebaseURL + 'presence/' + $scope.username + '/' + 'rooms');
        
        $scope.addMessage = function() {
            var userRef = onlineRef.child($scope.username);
            userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
            var $el = $('#messagesDiv');

            var from = $scope.username;
            var msg = encodeHTML($scope.message);
            if($scope.message.indexOf('/') === 0)
                commandHandler($scope, $scope.message);
            else {
                if(!privateChat) {
                    $scope.messages.add({sender: from, content: msg, private: false, type: 'public', date: Date.now()}, scrollWindow($el));
                    $scope.message = '';
                }
                else if(privateChat) {
                    $scope.messages.add({sender: from, content: msg, private: true, privateChat: true, recipient: privateChatUser, type: 'privateChat', date: Date.now()}, scrollWindow($el));
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
                var oldUserRef = onlineRef.child($.cookie('username'));
                var connRef = oldUserRef.child('online').remove();
                oldUserRef.child('logout').set(Firebase.ServerValue.TIMESTAMP);
                oldUserRef.child('online').remove();
                $.cookie('username', $('#username').val());
                
                userRef = onlineRef.child($scope.username);
                connRef = userRef.child('online').push(1);
                $scope.rooms = angularFireCollection(firebaseURL + 'presence/' + $scope.username + '/' + 'rooms'); //Resetting this seems to be necessary
            }
            else
                $scope.username = $.cookie('username');
        };
        
        $scope.privateChat = function($event) {
            commandHandler($scope, '/query ' + $($event.target).data('username'));
        }
        
        $scope.removeRoom = function($event) {
            var username = $($event.target).data('username');
            for (var i = 0; i < $scope.rooms.length; i++) {
                if($scope.rooms[i].username === username) {
                    $scope.rooms[i].remove = Date.now();
                    $scope.rooms[i].seen = Date.now();
                    $scope.rooms.update($scope.rooms[i]);
                    break;
                }
            }
            switchRoom('public', $scope, true); //last argument specifies dictates that switchRoom doesn't mess with the current room
        }
        
        $scope.changeRoom = function($event) {
            $scope.helpClass = 'hidden';
            switchRoom($event === 'public' ? $event : $($event.target).data('username'), $scope);
        }
        
        $scope.scroll = function() {
            $timeout(function() {
                var $el = $('#messagesDiv');
                if($el.length) $el[0].scrollTop = $el[0].scrollHeight;
            });
        }
    }
]);

function switchRoom(room, $scope, modified) {
    userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
    if(room === 'public') {
        if(privateChat && !modified)
            userRef.child('rooms').child(privateChatUser).set({username: privateChatUser, seen: Date.now()}); //if we're leaving private to go to public, we've seen the private message
        privateChat = false;
        privateChatUser = '';
        $scope.heading = 'Public Chat';
        $scope.privateChatUser = privateChatUser;
        $scope.info = '';
    }
    else {
        if(privateChat && !modified)
            userRef.child('rooms').child(privateChatUser).set({username: privateChatUser, seen: Date.now()}); //if we're leaving private to go to private, we've seen the private message
        privateChat = true;
        privateChatUser = room;
        $scope.privateChatUser = privateChatUser;
        $scope.heading = 'Private Chat with ' + privateChatUser;
        userRef.child('rooms').child(privateChatUser).set({username: privateChatUser, seen: Date.now()}); //the new if one doesn't exist, otherwise it's simply updated
        onlineRef.child(privateChatUser).on('value', function(dataSnapshot) {
            if(privateChat) //prevent this from being called in the wrong place
                $scope.info = 'User is <strong>' + (dataSnapshot.hasChild('online') ? 'online' : 'offline') + '</strong>';
        });
    }
    $scope.scroll();
}

function commandHandler($scope, msg) {
    var delim = msg.indexOf(' ');
    var command = delim !== -1 ? msg.substring(1, delim) : msg.substr(1);
    var username = $scope.username;
    var usernameRegexp = $scope.usernameRegexp.source;
    var $el = $('#messagesDiv');
    
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
                
                $scope.messages.add({sender: username, content: message, private: true, type: 'private', recipient: target, date: Date.now()}, scrollWindow($el));
                $scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username, content: 'private message sent to <em>' + target + '</em>: "' + message + '"', 
                    private: true, privateChat: privateChat, type: 'server', date: Date.now()}, scrollWindow($el));
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
                    $scope.helpClass = 'info';
                    $scope.help = 'Opened private chat room with ' + target;
                    switchRoom(target, $scope);
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
                $scope.messages.add({sender: username, content: action, private: privateChat, type: 'action', privateChat: privateChat, recipient: privateChatUser, date: Date.now()}, scrollWindow($el));
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
                            private: true, privateChat: privateChat, type: 'server', date: Date.now()}, scrollWindow($el));
                        whoisResult(true);
                    }
                    else if(dataSnapshot.hasChild('logout')) {
                        $scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username,
                            content: '<strong>whois</strong>: <em>' + target + '</em> is offline and was last seen ' + new Date(dataSnapshot.child('logout').val()).toString(), 
                            private: true, privateChat: privateChat, type: 'server', date: Date.now()}, scrollWindow($el));
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
                $scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username, content: '<strong>current time</strong>: ' + Date.now(), 
                    private: true, privateChat: privateChat, type: 'server', date: Date.now()}, scrollWindow($el));
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
                var target = privateChatUser;
                if(message.type === 'server' && message.recipient === target && message.privateChat)
                    result.push(message); //Message only seen in private chat room that it was sent in
                else if(message.type !== 'server' && message.privateChat && (target === message.sender || target === message.recipient) && (message.recipient === username || message.sender === username))
                    result.push(message); //Message only seen in private chat room
            }
            else {
                if(!message.privateChat && !message.private)
                    result.push(message); //Everyone sees the message
                else if(!message.privateChat && message.recipient === username)
                    result.push(message); //Message seen only by person it was privately sent to
                else if(message.privateChat && message.recipient === username && message.type !== 'server') { //Try to open new private room if we don't have one yet
                    var sender = message.sender;
                    userRef.child('rooms').once('value', function(dataSnapshot) {
                        if(!dataSnapshot.hasChild(sender)) { //we don't have a room yet, let's go to it (delegate task of creating it to switchRoom)
                            $scope.helpClass = 'info';
                            $scope.help = sender + ' initiated a private chat with you';
                            switchRoom(sender, $scope);
                            a = dataSnapshot;
                        }
                        else if(message.date - dataSnapshot.child(sender).child('remove').val() > 0 //message is newer than remove time
                                && message.date > dataSnapshot.child(sender).child('seen').val() //message is not seen
                                && $scope.privateChatUser !== sender) { //not already in room
                            $scope.helpClass = 'info';
                            $scope.help = sender + ' continued a private chat with you';
                            switchRoom(sender, $scope);
                        }
                    });
                }
            }
        }
        return result;
    }
});

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

function scrollWindow($el) {
    $el.animate({scrollTop: $el[0].scrollHeight}, 500);
}

//from http://stackoverflow.com/a/1219983/1266600
function encodeHTML(value){
  //create a in-memory div, set it's inner text(which jQuery automatically encodes)
  //then grab the encoded contents back out.  The div never exists on the page.
  return $('<div/>').text(value).html();
}
