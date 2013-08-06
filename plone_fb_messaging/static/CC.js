var app = angular.module('commandCentral', ['firebase', 'ngCookies']);

var usernameRegexp = new RegExp('[a-zA-Z0-9.-_]+$');

app.config(['$routeProvider', '$locationProvider', '$provide',
    function ($routeProvider, $locationProvider, $provide) {
    // Pick up templates from Plone.
    // 
    // XXX I want to pass parameters to my configuration.
    // XXX But it looks like this is either not documented or not possible 
    // XXX with ng-init. So, staticRoot comes in another way, and
    // the rest is configured not from config, but from authService.
    //
    var staticRoot = $('meta[name="fb-messaging-static"]').attr('content') || '../static/';

    $locationProvider
      .html5Mode(false)
      .hashPrefix('!');

    $routeProvider

        .when('/', {templateUrl: staticRoot + 'partials/CC.html',
            controller: 'CommandCentralController'
        })

        .when('/activity', {
            templateUrl: staticRoot + 'partials/fb_activity.html',
            controller: 'ActivityStreamController',
            activetab: 'activityStream'
        })

        .when('/messaging', {
            templateUrl: staticRoot + 'partials/fb_messaging.html',
            controller: 'PublicMessagingController',
            activetab: 'messaging'
        })

        //when('/messaging/private/:privateChatUser', {
        //    templateUrl: staticRoot + 'partials/fb_messaging.html',
        //    controller: 'PrivateMessagingController'})

        .when('/simulate_activity', {
            templateUrl: staticRoot + 'partials/fb_simulate_activity.html',
            controller: 'SimulateActivityController'
        })

        .when('/createBroadcast', {
            templateUrl: staticRoot + 'partials/fb_create_broadcast.html',
            controller: 'CreateBroadcastController',
            activetab: 'createBroadcast'
        })

        .when('/broadcast', {
            templateUrl: staticRoot + 'partials/fb_broadcasts.html',
            controller: 'ViewBroadcastsController',
            activetab: 'broadcasts'
        })

        .otherwise({redirectTo: '/'});

    $provide.service('getGlobals', function($rootScope) {
        $rootScope.staticRoot = staticRoot;
    });

    $provide.service('authService', function($rootScope) {

        // Configure parameters. In Plone these are provided from the template by ng-init.
         if (! $rootScope.firebaseUrl) {
            // We are in the static html. Let's provide
            // constants for testing.
            $rootScope.firebaseUrl = 'https://green-cc.firebaseio-demo.com/';
            $rootScope.authToken = '';
            $rootScope.ploneUserid = 'TestUser';
        }

        // Parse the url to find its root
        // A neat trick: we use the DOM to parse our url.
        var parser = document.createElement('a');
        parser.href = $rootScope.firebaseUrl;
        $rootScope.rootUrl = parser.protocol + '//' + parser.hostname + '/';

        console.log('Using Firebase URL: "' + $rootScope.firebaseUrl + '".');

        // Authenticate me.
        if ($rootScope.authToken) {
            var dataRef = new Firebase($rootScope.firebaseUrl);
            dataRef.auth($rootScope.authToken, function(error, result) {
                if (error) {
                    throw new Error('Authentication as "' + $rootScope.ploneUserid + '" failed! \n' + error);
                } else {
                    console.log('Authentication as "' + $rootScope.ploneUserid + '" accepted by the server.');
                }
            });
        } else {
            console.log('No authentication token. Continuing in static mode.');
        }

        var onlineRef = new Firebase($rootScope.firebaseUrl + 'presence');
        var connectedRef = new Firebase($rootScope.rootUrl + '.info/connected');
        var username = $rootScope.ploneUserid;
        connectedRef.on('value', function (snap) {
            if(snap.val() === true) {
                // We're connected or reconnected.
                // Set up our presence state and
                // tell the server to set a timestamp when we leave.
                var userRef = onlineRef.child(username);
                var connRef = userRef.child('online').push(1);
                userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
                userRef.child('online').onDisconnect().remove();
                userRef.child('lastActive').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
            }
        });
    });
}]);



app.controller('CommandCentralController',
    ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q', 'authService',
    function ($scope, $timeout, angularFire, angularFireCollection, $q, authService) {
}]);

app.controller('MenuController',
    ['$scope', '$route', 'authService',
    function ($scope, $route, authService) {
        $scope.$route = $route;
}]);

app.controller('CreateBroadcastController',
    ['$scope', '$rootScope', 'angularFireCollection', 'authService',
    function ($scope, $rootScope, angularFireCollection, authService) {
        $scope.broadcasts = angularFireCollection($rootScope.firebaseUrl + 'broadcasts');
        $scope.sendBroadcast = function () {
            $scope.broadcasts.add({
                message: $scope.broadcast.message,
                time: Firebase.ServerValue.TIMESTAMP,
                user: $rootScope.ploneUserid,
                expiration: Date.now() + $scope.broadcast.expiration * 60000
            });
        }
}]);

app.controller('ViewBroadcastsController',
    ['$scope', '$rootScope', '$q', '$filter', 'angularFireCollection', 'authService',
    function ($scope, $rootScope, $q, $filter, angularFireCollection, authService) {
        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        var profileRef = new Firebase($rootScope.firebaseUrl + 'profile');
        $scope.getBroadcastsSeenTS = function () {
            var deferred = $q.defer();
            profileRef.child($rootScope.ploneUserid).child('broadcastsSeenTS').on('value', function (dataSnapshot) {
                deferred.resolve(dataSnapshot.val());
                if (!$scope.$$phase) $scope.$apply();  //needed for the resolve to be processed
                $scope.broadcastsSeenTS = dataSnapshot.val();
            });
            return deferred.promise;
        };

        $scope.broadcasts = [];
        var promise = $scope.getBroadcastsSeenTS();
        promise.then(function (broadcastsSeenTS) {
            $scope.broadcastsSeenTS = broadcastsSeenTS;
            $scope.broadcasts = angularFireCollection($rootScope.firebaseUrl + 'broadcasts');
        });

        $scope.markSeen = function () {
            profileRef.child($rootScope.ploneUserid).child('broadcastsSeenTS').set(Firebase.ServerValue.TIMESTAMP);
        };

        $scope.scroll = function () {
            var $el = $('#broadcastsDiv');
            $el[0].scrollTop = $el[0].scrollHeight;
        }
}]);


// XXX this is only needed for the simulation and will go away in the final product.
app.controller('SimulateActivityController',
    ['$scope', '$rootScope', '$http', 'getGlobals',
    function ($scope, $rootScope, $http, getGlobals) {
        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        $scope.eventTypeOptions = [
            {id: 'modify', name: 'Modify'},
            {id: 'add', name: 'Add'},
            {id: 'delete', name: 'Delete'}
        ];

        $scope.activity = {};

        $scope.activity.eventType = $scope.eventTypeOptions[0];

        var fbMessagingHereUrl = window.fbMessagingHereUrl || '';
        $scope.save = function () {
            console.log('save');
            $http({
                method: 'GET',
                url: fbMessagingHereUrl + '/fb_messaging_simulate_activity',
                params: {
                    message: $scope.activity.message,
                    description: $scope.activity.description,
                    eventType: $scope.activity.eventType.id
                }
            });
        };

}]);

app.controller('ActivityStreamController',
    ['$scope', 'angularFireCollection', 'authService', '$rootScope',
    function ($scope, angularFireCollection, authService, $rootScope) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        $scope.filtered = false;

        //$scope.getLastSeen = function () {
        //    var deferred = $q.defer();
        //    onlineRef.child($rootScope.ploneUserid).child('lastSeen').on('value', function (dataSnapshot) {
        //        deferred.resolve(dataSnapshot.val());
        //        if (!$scope.$$phase) $scope.$apply();  //needed for the resolve to be processed
        //    });
        //    return deferred.promise;
        //};

        $scope.activities = [];
        //var promise = $scope.getLastSeen();
        //promise.then(function (lastSeen) {
            //$scope.lastSeen = lastSeen;
            $scope.activities = angularFireCollection($rootScope.firebaseUrl + 'activities');
        //});
        //

        $scope.markSeen = function () {
            //userRef.child('lastSeen').set(Firebase.ServerValue.TIMESTAMP);
        };

        //$scope.updateUsername = function () {
        //    updateUsername($scope, $cookieStore);
        //};

        /*This will ensure that if an event expires while displayed on the activity stream page, it will dissapear.
          However, this will result in recurring JS calls which may be undesirable and a flicker at every iteration.
          Comment out the setInterval call to disable this functionality */
        //setInterval(refresh, 10000);
        //function refresh() {
        //    $scope.activities = angularFireCollection($rootScope.firebaseUrl + 'activity', function () {
        //        if(!$scope.$$phase) $scope.$apply();
        //    });
        //}
    }
]);

app.controller('PublicMessagingController',
    ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    '$route', '$location', '$cookieStore', 'authService', '$rootScope',
    function ($scope, $timeout, angularFire, angularFireCollection, $q,
        $route, $location, $cookieStore, authService, $rootScope) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        // focus to messagesDiv
        $('#fb-messages-input')[0].focus();

        //setUsername($scope, $cookieStore);

        var username = $rootScope.ploneUserid;
        $scope.username = username;

        var onlineRef = new Firebase($rootScope.firebaseUrl + 'presence');

        $scope.privateChat = false;
        $scope.privateChatUser = false;
        $scope.heading = 'Public Chat';
        $scope.$location = $location;

        $scope.processMessage = function () {
            // Let's do this simple and easy. For the moment
            // do not process commands.

            var from = username;
            var msg = $scope.message; //encodeHTML($scope.message);

            ///if ($scope.message.indexOf('/') === 0) {
            //    ... process commands.
            //}

            $scope.messages.add({
                sender: from,
                content: msg,
                private: false,
                type: 'public',
                date: Date.now()
            });

            $scope.message = '';

        };

        //$scope.updateUsername = function () {
        //    updateUsername($scope, $cookieStore, angularFireCollection);
        //};

        //$scope.startPrivateChat = function (evt) {
        //    throw new Error('Private chat disabled now.');
        // c   //commandHandler($scope, $location, '/query ' + $(evt.target).data('username'));
        //};

        //$scope.removeRoom = function (evt) {
        //    removeRoom($scope, $location, evt);
        //};

        //$scope.switchRoom = function (target) {
        //    onRoomSwitch($scope, target, false);
        //};

        var promise = angularFire(onlineRef, $scope, 'users', {}); // bind the data so we can display who is logged in
        $scope.messages = angularFireCollection(new Firebase($rootScope.firebaseUrl + '/messages').limit(500));
        $scope.rooms = angularFireCollection($rootScope.firebaseUrl + 'presence/' +
            username + '/' + 'rooms');
    }
]);

app.directive('autoScroll', function ($timeout) { //This will behave badly on *initial* pageload
    return function ($scope, $el, attrs) {
        $scope.$watch(attrs.autoScroll + '.length', function() {
            $timeout(function() {
                //$el[0].scrollTop = $el[0].scrollHeight;
                $el
                    .stop(false, false)
                    .animate({
                        scrollTop: $el[0].scrollHeight
                    }, 500);
            });
        });
    };
});

// XXX Private message controller disabled now, it requires a major reorganizing
// XXX because the global functions makes it very hard to handle the scopes.
/*
app.controller('PrivateMessagingController',
    ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$route', '$q',
    '$routeParams', '$location', '$cookieStore', 'authService', '$rootScope',
    function ($scope, $timeout, angularFire, angularFireCollection, $route, $q,
        $routeParams, $location, $cookieStore, authService, $rootScope) {
        setUsername($scope, $cookieStore);

        var onlineRef = new Firebase($rootScope.firebaseUrl + 'presence');

        $scope.privateChat = true;
        $scope.privateChatUser = $routeParams.privateChatUser;
        $scope.heading = 'Private Chat with ' + $scope.privateChatUser;
        $scope.$location = $location;

        onlineRef.child($scope.privateChatUser).on('value', function (dataSnapshot) {
            if ($scope.privateChat) //prevent this from being called in the wrong place
                $scope.info = 'User is <strong>' + (dataSnapshot.hasChild('online') ? 'online' : 'offline') + '</strong>';
        });

        $scope.processMessage = function () {
            processMessage($scope, $location, $('#messagesDiv'));
        };

        $scope.updateUsername = function () {
            updateUsername($scope, $cookieStore, angularFireCollection);
        };

        $scope.startPrivateChat = function (evt) {
            commandHandler($scope, $location, '/query ' + $(evt.target).data('username'));
        };

        $scope.removeRoom = function (evt) {
            removeRoom($scope, $location, evt);
        };

        $scope.switchRoom = function (target) {
            onRoomSwitch($scope, target, false, $rootScope);
        };

        //connectedRef.on('value', function (dataSnapshot) {
        //    if (dataSnapshot.val() === true) login($scope);
        //});

        var promise = angularFire(onlineRef, $scope, 'users', {}); // bind the data so we can display who is logged in
        $scope.messages = angularFireCollection($rootScope.firebaseUrl + '/messages');
        $scope.rooms = angularFireCollection($rootScope.firebaseUrl + 'presence/' + $scope.username + '/' + 'rooms');
    }
]);
*/

//function setUsername($scope, $cookieStore) {
    // XXX XXX XXX
    //var username = 'TestUserX';
    //$scope.username = username;
    //return;
    // XXX XXX
    //var username = $cookieStore.get('username');
//    if (username === undefined || username.search(usernameRegexp) !== 0) {
//        var anonUser = 'Anonymous' + Math.floor(Math.random() * 111);
//        $scope.username = anonUser; //Very bad things happen if two people have the same username
//        $cookieStore.put('username', anonUser);
//    }
//    else if (username.search(usernameRegexp) === 0)
//        $scope.username = username;
//}

//function login($scope) {
//    // We're connected (or reconnected)!  Set up our presence state and
//    // tell the server to set a timestamp when we leave.
//    userRef = onlineRef.child($scope.username);
//    var connRef = userRef.child('online').push(1);
//    userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
//    userRef.child('online').onDisconnect().remove();
//    userRef.child('logout').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
//}

// XXX This looks like something to go in an event handler.
function onRoomSwitch($scope, targetRoom, modified, $rootscope) {

    var privateChatUser = $scope.privateChatUser;
    var privateChat = $scope.privateChat;
    if (targetRoom === 'public') {
        if( privateChat && !modified)
            userRef.child('rooms').child(privateChatUser).set({
                username: privateChatUser,
                seen: Date.now()
            }); //if we're leaving private to go to public, we've seen the private message
    }
    else {
        if (privateChat && !modified && privateChatUser) {
                userRef.child('rooms').child(privateChatUser).set({
                    username: privateChatUser,
                    seen: Date.now()
                }); //if we're leaving private to go to private, we've seen the private message
        }

        // XXX This should also be done differently.
        var onlineRef = new Firebase($rootScope.firebaseUrl + 'presence');
        var userRef = onlineRef.child(username);

        userRef.child('rooms').child(targetRoom).set({
            username: targetRoom,
            seen: Date.now(),
            remove: 0
        }); //create the new room if one doesn't exist, otherwise it's simply updated
    }
}

function removeRoom($scope, $location, $event) {
    var username = $($event.target).data('username');
    for (var i = 0; i < $scope.rooms.length; i++) {
        if ($scope.rooms[i].username === username) {
            $scope.rooms[i].remove = Date.now();
            $scope.rooms[i].seen = Date.now();
            $scope.rooms.update($scope.rooms[i]);
            break;
        }
    }
    onRoomSwitch($scope, 'public', true, $rootScope); //last argument specifies dictates to not mess with the current room
    $location.url('/messaging');
}

function updateUsername($scope, $cookieStore, angularFireCollection) {
    return;

    // XXX XXX XXX

//    var username = $scope.username;
//    if (username.search(usernameRegexp) === 0) {
//        var oldUserRef = onlineRef.child($cookieStore.get('username'));
//        var connRef = oldUserRef.child('online').remove();
//        oldUserRef.child('logout').set(Firebase.ServerValue.TIMESTAMP);
//        oldUserRef.child('online').remove();
//        $cookieStore.put('username', $('#username').val());
//
//        userRef = onlineRef.child($scope.username);
//        connRef = userRef.child('online').push(1);
//        if (angularFireCollection) {
//            $scope.rooms = angularFireCollection(firebaseUrl + 
//                'presence/' + $scope.username + '/' + 'rooms'); //Resetting this seems to be necessary
//        }
//    }
//    else
//        $scope.username = $cookieStore.get('username'); //Revert to valid username if the one user provides is invalid
}

/*
function processMessage($scope, $location, messageWindow) {

    ///userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);

    var from = $scope.username;
    var msg = encodeHTML($scope.message);
    //var privateChat = $scope.privateChat;
    //if ($scope.message.indexOf('/') === 0)
    //    commandHandler($scope, $location, $scope.message);
    //else {
        //if (privateChat) {
        //    $scope.messages.add({
        //        sender: from,
        //        content: msg,
        //        private: true,
        //        privateChat: true,
        //        recipient: $scope.privateChatUser,
        //        type: 'privateChat',
        //        date: Date.now()
        //    });
        //} else {
            $scope.messages.add({
                sender: from,
                content: msg,
                private: false,
                type: 'public',
                date: Date.now()
            });
        //}
        $scope.message = '';
        $scope.helpClass = 'hidden';
    //}

    // prevent double click warning for this form
    // (this is a hack needed for Plone)
    //$root.find('input[value="Send"]')
    //    .removeClass('submitting');
}
*/


function commandHandler($scope, $location, msg, $rootScope) {
    var delim = msg.indexOf(' ');
    var command = delim !== -1 ? msg.substring(1, delim) : msg.substr(1);
    var username = $scope.username;
    var usernameRegexpSource = usernameRegexp.source.slice(0, -1); //remove last $ character to allow command to continue
    var $el = $('#messagesDiv');
    var privateChat = $scope.privateChat;
    var privateChatUser = $scope.privateChatUser;
    var target;

    function whoisResult(result) {
        $scope.helpClass = result ? 'info' : 'error';
        $scope.help = 'Whois query ' + (result ? 'successful' : 'unsuccessful');
    }

    switch (command) {
        case 'msg':
            if(msg.search('/msg\\s' + usernameRegexpSource + '\\s.+') !== 0) {
                $scope.helpClass = 'error';
                $scope.help = 'Bad syntax - /msg {target username} {message}';
            }
            else {
                var delim2 = msg.indexOf(' ', delim + 1);
                target = msg.substring(delim + 1, delim2);
                var message = encodeHTML(msg.substr(delim2 + 1));

                $scope.messages.add({
                    sender: username,
                    content: message,
                    private: true,
                    type: 'private',
                    recipient: target,
                    date: Date.now()
                });
                $scope.messages.add({
                    sender: username,
                    recipient: privateChat ? privateChatUser : username,
                    content: 'private message sent to <em>' + target + '</em>: "' + message + '"',
                    private: true,
                    privateChat: privateChat,
                    type: 'server',
                    date: Date.now()
                });
                $scope.helpClass = 'info';
                $scope.help = 'Message sent to ' + target;
            }
            break;
        case 'query':
            if (msg.search('/query\\s' + usernameRegexpSource + '$') !== 0) {
                $scope.helpClass = 'error';
                $scope.help = 'Bad syntax - /query {target username}';
            } else {
                target = msg.substr(delim + 1);
                if (target !== $scope.username) {
                    $scope.helpClass = 'info';
                    $scope.help = 'Opened private chat room with ' + target;
                    onRoomSwitch($scope, target, false, $rootScope);
                    $location.url('/messaging/private/' + target);
                }
                else {
                    $scope.helpClass = 'error';
                    $scope.help = 'You cannot private chat with yourself';
                }
            }
            break;
        case 'me':
            var action = encodeHTML(msg.substr(delim + 1));
            if (msg.search('/me\\s.+') !== 0) {
                $scope.helpClass = 'error';
                $scope.help = 'Bad syntax - /me {action}';
            }
            else {
                $scope.messages.add({sender: username, content: action, private: privateChat, type: 'action', privateChat: privateChat, recipient: privateChatUser, date: Date.now()});
                $scope.helpClass = 'hidden';
            }
            break;
        case 'whois':
            if (msg.search('/whois\\s' + usernameRegexpSource + '$') !== 0) {
                $scope.helpClass = 'error';
                $scope.help = 'Bad syntax - /whois {target username}';
            }
            else {
                target = msg.substr(delim + 1);
                onlineRef.child(target).once('value', function(dataSnapshot) {
                    if (dataSnapshot.hasChild('lastActive')) {
                        $scope.messages.add({sender: username, recipient: privateChat ? privateChatUser : username,
                            content: '<strong>whois</strong>: <em>' + target + '</em> is online and was last active ' + new Date(dataSnapshot.child('lastActive').val()).toString(),
                            private: true, privateChat: privateChat, type: 'server', date: Date.now()});
                        whoisResult(true);
                    }
                    else if (dataSnapshot.hasChild('logout')) {
                        $scope.messages.add({
                            sender: username,
                            recipient: privateChat ? privateChatUser : username,
                            content: '<strong>whois</strong>: <em>' + target +
                                '</em> is offline and was last seen ' +
                                new Date(dataSnapshot.child('logout').val()).toString(),
                            private: true,
                            privateChat: privateChat,
                            type: 'server',
                            date: Date.now()
                        });
                        whoisResult(true);
                    } else {
                        whoisResult(false);
                    }
                }, whoisResult);
            }
            break;
        case 'time':
            if (msg.search('/time$') !== 0) {
                $scope.helpClass = 'error';
                $scope.help = 'Bad syntax - /time';
            }
            else {
                $scope.messages.add({
                    sender: username,
                    recipient: privateChat ? privateChatUser : username,
                    content: '<strong>current time</strong>: ' + Date.now(),
                    private: true,
                    privateChat: privateChat,
                    type: 'server',
                    date: Date.now()
                });
                $scope.helpClass = 'hidden';
            }
            break;
        //TODO: Add more commands if desired
        default : {
            $scope.helpClass = 'error';
            $scope.help = 'Unrecognized command: ' + msg;
        }
    }
    $scope.message = '';
}

//from http://stackoverflow.com/a/1219983/1266600
function encodeHTML(value) {
  //create a in-memory div, set it's inner text(which jQuery automatically encodes)
  //then grab the encoded contents back out.  The div never exists on the page.
  return $('<div/>').text(value).html();
}

app.filter('broadcastFilter', function() {
    return function (broadcasts, broadcastsSeenTS, showAll) {
        if (showAll === 'true') return broadcasts;
        else {
            var result = [];
            for (var i = 0; i < broadcasts.length; i++) {
                var broadcast = broadcasts[i];
                if (broadcast.time > broadcastsSeenTS)
                    result.push(broadcast);
            }
            return result;
        }
    };
});

app.filter('activityFilter', function() {
    return function (activities, filtered, lastSeen) {
        var result = [];
        for (var i = 0; i < activities.length; i++) {
            var activity = activities[i];
            if (! filtered || activity.time > lastSeen)
                result.push(activity);
        }
        return result;
    };
});

app.filter('millisToReadableDate', function() {
    return function(date) {
        return new Date(date).toString();
    };
});

app.filter('timeFromNow', function () {
    return function (date) {
        return (date - Date.now())/1000 + ' seconds'; //This can be easily improved to increase verbosity
    };
});

app.filter('onlineFilter', function () {
    return function (users, $scope) {
        var result = {};
        for (var username in users) {
            var user = users[username];
            if(user.online)
                result[username] = user;
        }
        // XXX The filter should not update, just - as the name says - filter.
        $scope.numUsers = ' (' + Object.keys(result).length + ')';
        return result;
    };
});

// XXX Accessing $scope from the filter should be avoided, as it makes
// XXX the filter depending on the entire universe, instead it should depend
// XXX on well defined input values.
// 
// XXX disable messages filter for now entirely. Discuss how to bring it back.

/*
app.filter('messageFilter', function () {
    return function (messages, $scope) {
        var result = [];
        var message;
        var username = $scope.username;
        for (var i = 0; i < messages.length; i++) { //TODO: don't show all messages
            message = messages[i];

            if($scope.privateChat) {
                var target = $scope.privateChatUser;
                if(message.type === 'server' && message.recipient === target && message.privateChat)
                    result.push(message); //Message only seen in private chat room that it was sent in
                else if(message.type !== 'server' && message.privateChat && (target === message.sender || target === message.recipient) && (message.recipient === username || message.sender === username))
                    result.push(message); //Message only seen in private chat room
            } else {
                if (!message.privateChat && !message.private)
                    result.push(message); //Everyone sees the message
                else if (!message.privateChat && message.recipient === username)
                    result.push(message); //Message seen only by person it was privately sent to
                else if (message.privateChat && message.recipient === username && message.type !== 'server') { //Try to open new private room if we don't have one yet
                    var sender = message.sender;

                    // XXX This should also be done differently.

                    //var onlineRef = new Firebase($scope.$rootScope.firebaseUrl + 'presence');
                    //var userRef = onlineRef.child(username);

                    // XXX A filter is by definition readonly and this should be done from somewhere else.
                    
                    userRef.child('rooms').once('value', function(dataSnapshot) {
                        if (!dataSnapshot.hasChild(sender)) { //we don't have a room yet, let's go to it (delegate task of creating it to onRoomSwitch)
                            $scope.helpClass = 'info';
                            $scope.help = sender + ' initiated a private chat with you';
                            onRoomSwitch($scope, sender, false);
                            if ($scope.$location) {
                                $scope.$location.url('/messaging/private/' + sender); //nonfunctional at the moment
                            }
                        } else if ((message.date - dataSnapshot.child(sender).child('remove').val() > 0) && //message is newer than remove time
                                (message.date > dataSnapshot.child(sender).child('seen').val()) && //message is not seen
                                ($scope.privateChatUser !== sender)) { //not already in room
                            $scope.helpClass = 'info';
                            $scope.help = sender + ' continued a private chat with you';
                            onRoomSwitch($scope, sender, false);
                            if ($scope.$location) $scope.$location.url('/messaging/private/' + sender); //nonfunctional at the moment
                        }
                    });
                    
                }
            }
            
        }
        return result;
    };
});
*/


// editing messages
// TODO: do not allow linebreaks
app.directive('contenteditable', function () {
    return {
        restrict: 'A',
        require: '?ngModel',
        link: function( $scope, element, attrs, ngModel) {

            ngModel.$render = function () {
                element.html(ngModel.$viewValue.content || '');
            };

            element.bind('blur', function () {
                var message = ngModel.$modelValue;
                message.content = $.trim(element.html());
                $scope.messages.update(message);
            });

        }
    };
});
