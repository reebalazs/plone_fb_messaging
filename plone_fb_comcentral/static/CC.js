var app = angular.module('commandCentral', ['firebase', 'ngCookies']);

app.config(['$routeProvider', '$locationProvider', '$provide',
    function ($routeProvider, $locationProvider, $provide) {
    // Pick up templates from Plone.
    // 
    // XXX I want to pass parameters to my configuration.
    // XXX But it looks like this is either not documented or not possible 
    // XXX with ng-init. So, staticRoot comes in another way, and
    // the rest is configured not from config, but from authService.
    //
    var staticRoot = $('meta[name="fb-comcentral-static"]').attr('content') || '../static/';

    $locationProvider
      .html5Mode(false)
      // need to use '*'' as a prefix to distinguish from Plone,
      // as Plone's TOC uses already '!
      .hashPrefix('*');

    // this is needed to inject AuthService in here
    function authResolve(AuthService) {
        return AuthService.promise;
    }

    $routeProvider

        .when('/', {templateUrl: staticRoot + 'partials/fb_comcentral.html',
            controller: 'CommandCentralController',
            resolve: {auth: authResolve}
        })

        .when('/activity', {
            templateUrl: staticRoot + 'partials/fb_activity.html',
            controller: 'ActivityStreamController',
            resolve: {auth: authResolve},
            activetab: 'activityStream'
        })

        .when('/messaging/:roomType/:roomName', {
            templateUrl: staticRoot + 'partials/fb_messaging.html',
            controller: 'MessagingController',
            resolve: {auth: authResolve},
            activetab: 'messaging'
        })

        .when('/simulate_activity', {
            templateUrl: staticRoot + 'partials/fb_simulate_activity.html',
            controller: 'SimulateActivityController',
            resolve: {auth: authResolve},
            activetab: 'simulateActivity'
        })

        .when('/create_broadcast', {
            templateUrl: staticRoot + 'partials/fb_create_broadcast.html',
            controller: 'CreateBroadcastController',
            resolve: {auth: authResolve},
            activetab: 'createBroadcast'
        })

        .when('/broadcast', {
            templateUrl: staticRoot + 'partials/fb_broadcasts.html',
            controller: 'ViewBroadcastsController',
            resolve: {auth: authResolve},
            activetab: 'broadcasts'
        })

        .otherwise({redirectTo: '/'});

}]);

app.service('AuthService', function($rootScope, angularFire, $q) {
    // Configure parameters. In Plone these are provided from the template by ng-init.
     if (! $rootScope.firebaseUrl) {
        // We are in the static html. Let's provide
        // constants for testing.
        $rootScope.firebaseUrl = 'https://green-cc.firebaseio-demo.com/';
        $rootScope.authToken = '';
        var rand = Math.floor(Math.random()*101); // Vary userid to make testing easier
        $rootScope.ploneUserid = 'TestUser' + rand;
        $rootScope.ploneFullName = 'Test User ' + rand;
    } else if (! $rootScope.ploneFullName) {
        // if empty full name, substitute with username
        $rootScope.ploneFullName = $rootScope.ploneUserid;
    }

    console.log('Using Firebase URL: "' + $rootScope.firebaseUrl + '".');
    var firebase = new Firebase($rootScope.firebaseUrl);
    $rootScope.fireBase = firebase;

    // Authenticate me.
    var authQ = $q.defer();    // XX Not sure if we need to Q for auth.
    if ($rootScope.authToken) {
        firebase.auth($rootScope.authToken, function(error, result) {
            if (error) {
                throw new Error('Authentication as "' + $rootScope.ploneUserid + '" failed! \n' + error);
            } else {
                authQ.resolve();
                console.log('Authentication as "' + $rootScope.ploneUserid + '" (' +
                    $rootScope.ploneFullName + ') accepted by the server.');
            }
        });
    } else {
        authQ.resolve();
        console.log('No authentication token. Continuing in static mode, acting as user "' +
            $rootScope.ploneUserid + '" (' + $rootScope.ploneFullName + ')');
    }

    // presence handling
    var username = $rootScope.ploneUserid;
    var onlineRef = firebase.child('presence');
    var infoRef = firebase.root().child('.info');
    infoRef.child('connected').on('value', function (snap) {
        if(snap.val() === true) {
            // We're connected or reconnected.
            // Set up our presence state and
            // tell the server to set a timestamp when we leave.
            var userRef = onlineRef.child(username);
            userRef.child('lastActive').set(Firebase.ServerValue.TIMESTAMP);
            userRef.child('lastActive').onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
            var connRef = userRef.child('online').push(1);
            connRef.onDisconnect().remove();
        }
    });

    var serverTimeOffsetQ = $q.defer();
    infoRef.child('serverTimeOffset').on('value', function (snap) {
        $rootScope.serverTimeOffset = snap.val();
        serverTimeOffsetQ.resolve();
    });

    // profile handling
    var profileRef = new Firebase($rootScope.firebaseUrl).child('profile').child(username);
    var userProfilePromise = angularFire(profileRef, $rootScope, 'userProfile', {});

    // promise will satisfy when both serverTimeOffset and userProfile are read.
    this.promise = $q.all([
        authQ.promise,              // XXX not sure if needed, and if not then whether it causes trouble
        serverTimeOffsetQ.promise,
        userProfilePromise
    ]);

});

app.controller('CommandCentralController',
    ['$scope', '$rootScope',
    function ($scope, $rootScope) {
}]);

app.controller('MenuController',
    ['$scope', '$route',
    function ($scope, $route) {
        $scope.$route = $route;
}]);

app.controller('CreateBroadcastController',
    ['$scope', '$rootScope', 'angularFireCollection',
    function ($scope, $rootScope, angularFireCollection) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        $scope.broadcasts = angularFireCollection($rootScope.firebaseUrl + 'broadcasts');
        $scope.sendBroadcast = function () {
            $scope.broadcasts.add({
                message: $scope.broadcast.message,
                time: Firebase.ServerValue.TIMESTAMP,
                user: $rootScope.ploneUserid,
                expiration: Date.now() + $scope.broadcast.expiration * 60000
            });
        };
}]);

app.controller('ViewBroadcastsController',
    ['$scope', '$rootScope', '$q', '$filter', 'angularFireCollection',
    function ($scope, $rootScope, $q, $filter, angularFireCollection) {

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

        var broadcastsUrl = $rootScope.firebaseUrl + 'broadcasts';
        var broadcastsRef = new Firebase(broadcastsUrl);
        $scope.showAll = 'false';
        $scope.unfilteredBroadcasts = angularFireCollection(broadcastsUrl);
        $scope.filteredBroadcasts = {};
        $scope.visibleBroadcasts = $scope.filteredBroadcasts;

        var promise = $scope.getBroadcastsSeenTS();
        promise.then(function (broadcastsSeenTS) {
            $scope.broadcastsSeenTS = broadcastsSeenTS;
            broadcastsRef.on('child_added', function(dataSnapshot) { //this will trigger for each existing child as well
                var newBroadcast = dataSnapshot.val();
                var expired = Date.now() > newBroadcast.expiration;
                var seen = $scope.broadcastsSeenTS !== null && newBroadcast.time < $scope.broadcastsSeenTS;
                if (! expired && ! seen)
                    $scope.filteredBroadcasts[dataSnapshot.ref().name()] = newBroadcast;
            });
        });

        $scope.toggleShow = function () {
            $scope.visibleBroadcasts = $scope.showAll === 'true' ? $scope.unfilteredBroadcasts : $scope.filteredBroadcasts;
        }

        $scope.markSeen = function () {
            profileRef.child($rootScope.ploneUserid).child('broadcastsSeenTS').set(Firebase.ServerValue.TIMESTAMP);
            $scope.filteredBroadcasts = {};
            $scope.visibleBroadcasts = $scope.filteredBroadcasts;
            $scope.toggleShow();
        };
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
            $http({
                method: 'GET',
                url: fbMessagingHereUrl + '/fb_comcentral_simulate_activity',
                params: {
                    message: $scope.activity.message,
                    description: $scope.activity.description,
                    eventType: $scope.activity.eventType.id
                }
            });
        };
}]);

app.controller('ActivityStreamController',
    ['$scope', 'angularFireCollection', '$rootScope',
    function ($scope, angularFireCollection, $rootScope) {

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

app.controller('MessagingController',
    ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q', '$routeParams', '$location', '$cookieStore', '$rootScope',
    'handleCommand', 'createPublicRoom', 'createPrivateRoom', 'hideRoom', 'processMessage', 'userFilter',
    function ($scope, $timeout, angularFire, angularFireCollection, $q, $routeParams, $location, $cookieStore, $rootScope,
        handleCommand, createPublicRoom, createPrivateRoom, hideRoom, processMessage, userFilter) {

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

        $scope.helpMessage = {helpClass: 'hidden', help: ''};

        $scope.processMessage = function () {
            processMessage(username, $scope.message, $scope.messages, onlineRef, $scope.helpMessage, $location);
            $scope.message = ''; //clear message input
        };

        //$scope.updateUsername = function () {
        //    updateUsername($scope, $cookieStore, angularFireCollection);
        //};

        $scope.rooms = angularFireCollection($rootScope.firebaseUrl + 'rooms');
        $scope.publicRooms = angularFireCollection($rootScope.firebaseUrl + 'rooms/publicRooms');
        $scope.privateRooms = angularFireCollection($rootScope.firebaseUrl + 'rooms/privateRooms');
        $scope.currentRoomName = $routeParams.roomName;

        var roomType = $routeParams.roomType;
        var currentRoomRef = new Firebase($rootScope.firebaseUrl + 'rooms').child(roomType + 'Rooms').child($scope.currentRoomName);
        currentRoomRef.child('name').set($scope.currentRoomName);
        currentRoomRef.child('type').set(roomType);
        currentRoomRef.child('hidden').child(username).remove(); //If we are in the room, we do not want it hidden - this will allow reentering a hidden room

        var membersPromise = angularFire(currentRoomRef.child('members'), $scope, 'members', {});
        var usersPromise = angularFire(onlineRef, $scope, 'users', {});
        $scope.$watch('[users, members]' , function () { // not the most efficient, could be done with usersPromise.then but will not trigger again (no updates)
            $scope.onlineUsers = userFilter($scope.users, $scope.members);
        }, true);

        $scope.messages = angularFireCollection(currentRoomRef.child('messages').limit(500));

        if (roomType === 'public') {
            $scope.heading = 'Public Chat: ' + $scope.currentRoomName;
        }
        else if (roomType === 'private') {
            var users = $scope.currentRoomName.split('!~!');
            var privateChatUser = users[0] === username ? users[1] : users[0]; // TODO: Kick out user if he/she doesn't belong
            $scope.heading = 'Private Chat with ' + privateChatUser;

            var checkOnline = onlineRef.child(privateChatUser).on('value', function (dataSnapshot) {
                $scope.info = 'User is <strong>' + (dataSnapshot.hasChild('online') ? 'online' : 'offline') + '</strong>';
            });
        }

        var inRoomRef = currentRoomRef.child('members').child(username).push(1);
        inRoomRef.onDisconnect().remove();
        currentRoomRef.child('messages').on('child_added', function(dataSnapshot) { //Listen for child_modified as well when editable chat messages revived
            currentRoomRef.child('lastMessaged').set(Firebase.ServerValue.TIMESTAMP);
        });

        $scope.createPublicRoom = createPublicRoom;
        $scope.createPrivateRoom = createPrivateRoom;
        $scope.hideRoom = hideRoom;

        $scope.$watch(function () {
            return $location.path();
        }, function (newValue, oldValue) {
            if(newValue !== oldValue) {
                inRoomRef.remove(); //Remove user from members if they are no longer on the same page
                if(roomType === 'private') onlineRef.off('value', checkOnline); //Stop watching since we are no longer on the same page
            }
        });
    }
]);

//TODO: Does not work with a filter
app.directive('autoScroll', function ($timeout) {
    return function ($scope, $el, attrs) {
        var timer = false;
        // remember the minimal length during a batch of continous changes
        // because we want to wait until the changes are over, and only
        // scroll once in the end. This is most important when firebase
        // loads a long list of items.
        var minimalLength;
        $scope.$watch(function() {
            var scrollableElem = $scope[attrs.autoScroll];
            if(scrollableElem instanceof Object)
                return Object.keys(scrollableElem).length
            else
                return scrollableElem.length;
        }, function(newLength, oldLength) {
            if (newLength == oldLength) {
                // triggers with 0, 0 initially. Let's skip it.
                return;
            }
            // Do some delay to wait until changes are propagated
            // and act only once.
            // This makes initial scrolldown work better.
            // (We will get called by (0, 1), (1, 2), (2, 3) and so on
            // and we have to avoid acting so many times.)
            if (timer) {
                $timeout.cancel(timer);
                minimalLength = Math.min(minimalLength, oldLength);
            } else {
                // the new batch of length changes start now
                minimalLength = oldLength;
            }
            timer = $timeout(function() {
                if (newLength - minimalLength > 5) {
                    // big increase and initial load: jump to end
                    $el[0].scrollTop = $el[0].scrollHeight;
                } else {
                    // small increase: scroll to end
                    $el
                        .stop(false, false)
                        .animate({
                            scrollTop: $el[0].scrollHeight
                        }, 500);
                }
                // reset the timer, we are finished.
                timer = null;
            }, 100);
        });
    };
});

// editing messages
app.directive('contenteditable', function () {
    return {
        restrict: 'A',
        require: '?ngModel',
        link: function( $scope, element, attrs, ngModel) {

            $(element).on('keydown', function(e) {
                if(e.which == 13) {
                    $(this).blur(); //let directive handle the rest
                    return false; //prevent enter from being added to message content
                }
            });

            ngModel.$render = function () {
                element.html(ngModel.$viewValue.content || '');
            };

            element.bind('blur', function () {
                var message = ngModel.$modelValue;
                message.content = $.trim(element.text());
                ngModel.$setViewValue(message.content);
                if(message.content === '')
                    $scope.messages.remove(message);
                else 
                    $scope.messages.update(message); //buggy on multiple consecutive edits without time for the other to complete
            });

        }
    };
});

app.factory('handleCommand', ['createPrivateRoom', function (createPrivateRoom) {
    return function (msg, messages, ploneUserid, onlineRef, helpMessage, $location) {
        var delim = msg.indexOf(' ');
        var command = delim !== -1 ? msg.substring(1, delim) : msg.substr(1);
        var username = ploneUserid;
        var usernameRegexp = new RegExp('[a-zA-Z0-9.-_]+$');
        var usernameRegexpSource = usernameRegexp.source.slice(0, -1); //remove last $ character to allow command to continue

        switch (command) {
            /* case 'msg':
                if(msg.search('/msg\\s' + usernameRegexpSource + '\\s.+') !== 0) {
                    $scope.helpClass = 'error';
                    $scope.help = 'Bad syntax - /msg {target username} {message}';
                }
                else {
                    var delim2 = msg.indexOf(' ', delim + 1);
                    target = msg.substring(delim + 1, delim2);
                    var message = encodeHTML(msg.substr(delim2 + 1));

                    $scope.messages.add({
                        sender: ploneUserid,
                        content: message,
                        private: true,
                        type: 'private',
                        recipient: target,
                        date: Date.now()
                    });
                    $scope.messages.add({
                        sender: ploneUserid,
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
                break; */
            case 'query':
                if (msg.search('/query\\s' + usernameRegexpSource + '$') !== 0) {
                    helpMessage.helpClass = 'error';
                    helpMessage.help = 'Bad syntax - /query {target username}: ' + msg;
                } else {
                    target = msg.substr(delim + 1);
                    if (target !== ploneUserid) {
                        helpMessage.helpClass = 'info';
                        helpMessage.help = 'Opened private chat room with ' + target;
                        createPrivateRoom(ploneUserid, target);
                    }
                    else {
                        helpMessage.helpClass = 'error';
                        helpMessage.help = 'You cannot private chat with yourself';
                    }
                }
                break;
            case 'me':
                var action = msg.substr(delim + 1);
                if (msg.search('/me\\s.+') !== 0) {
                    helpMessage.helpClass = 'error';
                    helpMessage.help = 'Bad syntax - /me {action}: ' + msg;
                }
                else {
                    messages.add({
                        sender: ploneUserid,
                        content: action,
                        private: false,
                        type: 'action',
                        date: Date.now()
                    });
                    helpMessage.helpClass = 'hidden';
                }
                break;
            case 'whois':
                if (msg.search('/whois\\s' + usernameRegexpSource + '$') !== 0) {
                    helpMessage.helpClass = 'error';
                    helpMessage.help = 'Bad syntax - /whois {target username}: ' + msg;
                }
                else {
                    target = msg.substr(delim + 1);
                    onlineRef.child(target).once('value', function(dataSnapshot) {
                        if (dataSnapshot.hasChild('lastActive')) {
                            messages.add({
                                sender: ploneUserid,
                                content: '<strong>whois</strong>: <em>' + target + '</em> is online and was last active ' + new Date(dataSnapshot.child('lastActive').val()).toString(),
                                private: true,
                                type: 'server',
                                date: Date.now()
                            });
                            helpMessage.helpClass = 'info';
                            helpMessage.help = 'Whois query successful';
                        }
                        else if (dataSnapshot.hasChild('logout')) {
                            messages.add({
                                sender: ploneUserid,
                                content: '<strong>whois</strong>: <em>' + target + '</em> is offline and was last seen ' + new Date(dataSnapshot.child('logout').val()).toString(),
                                private: true,
                                type: 'server',
                                date: Date.now()
                            });
                            helpMessage.helpClass = 'info';
                            helpMessage.help = 'Whois query successful';
                        } else {
                            helpMessage.helpClass = 'error';
                            helpMessage.help = 'Whois query unsuccessful: ' + msg;
                        }
                    });
                }
                break;
            case 'time':
                if (msg.search('/time$') !== 0) {
                    //helpClass = 'derpaderp';
                    helpMessage.helpClass = 'error';
                    helpMessage.help = 'Bad syntax - /time: ' + msg;
                }
                else {
                    messages.add({
                        sender: ploneUserid,
                        content: '<strong>current time</strong>: ' + Date.now(),
                        private: true,
                        type: 'server',
                        date: Date.now()
                    });
                    helpMessage.helpClass = 'hidden';
                }
                break;
            //TODO: Add more commands if desired
            default: {
                helpMessage.helpClass = 'error';
                helpMessage.help = 'Unrecognized command: ' + msg;
            }
        }
    };
}]);

app.factory('createPublicRoom', ['$location', function ($location) {
    return function (newRoomName) {
        $location.url('/messaging/public/' + newRoomName); //This has the intended side effect of reopening created rooms (including hidden ones)
    }
}]);

app.factory('createPrivateRoom', ['$location', function ($location) {
    return function (username, privateChatUser) {
        if(privateChatUser === username)
            throw new Error('Cannot private chat with yourself');
        var newRoomName = username < privateChatUser ? username + '!~!' + privateChatUser : privateChatUser + '!~!' + username;
        $location.url('/messaging/private/' + newRoomName); //This has the intended side effect of reopening created rooms (including hidden ones)
    }
}]);

app.factory('hideRoom', ['$location', '$rootScope', function ($location, $rootScope) {
    return function (roomType, roomName, username, currentRoomName) {
        var roomsRef = new Firebase($rootScope.firebaseUrl + 'rooms');
        roomsRef.child(roomType + 'Rooms').child(roomName).child('hidden').child(username).set(Firebase.ServerValue.TIMESTAMP);
        if(currentRoomName === roomName)
            $location.url('/messaging/public/main'); //Since current room is hidden, redirect to main (which cannot be hidden)
    };
}]);

app.factory('processMessage', ['handleCommand', function(handleCommand) {
    return function (username, message, messages, onlineRef, helpMessage, $location) {
        if (message.indexOf('/') === 0) {
            handleCommand(message, messages, username, onlineRef, helpMessage, $location);
            /*TODO: Fix helpMessage display - changes to $scope.helpMessage are not always detected but wrapping in $scope.$apply 
            is not possible due to firebase callbacks and passing $scope.$apply into handleCommand results in an error */
        }
        else {
            messages.add({
                sender: username,
                content: message,
                private: false,
                type: 'public',
                date: Date.now()
            });
            helpMessage.helpClass = 'hidden';
        }
    };
}]);

app.factory('userFilter', function () {
    return function (users, members) {
        var result = {};
        for (var username in users) {
            var user = users[username];
            user.inRoom = members.hasOwnProperty(username);
            if (user.online)
                result[username] = user;
        }
        return result;
    };
});

app.filter('publicRoomFilter', function() {
    return function (rooms, ploneUserid) {
        var result = [];
        for (var i = 0; i < rooms.length; i++) {
            var room = rooms[i];
            var roomHidden = room.hidden && room.hidden.hasOwnProperty(ploneUserid) && (room.lastMessaged === undefined || room.lastMessaged < room.hidden[ploneUserid]);
            if (! roomHidden)
                result.push(room);
        }
        return result;
    };
});

app.filter('privateRoomFilter', function() {
    return function (rooms, ploneUserid) {
        var result = [];
        for (var i = 0; i < rooms.length; i++) {
            var room = rooms[i];
            var members = room.name.split('!~!');
            var inPrivateRoom = members[0] === ploneUserid || members[1] === ploneUserid; //if this user is a member of the conversation
            var roomHidden = room.hidden && room.hidden.hasOwnProperty(ploneUserid) && (room.lastMessaged === undefined || room.lastMessaged < room.hidden[ploneUserid]);
            if (inPrivateRoom && ! roomHidden)
                result.push(room);
        }
        return result;
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

app.filter('prettifyRoomName', function() {
    return function(roomName) {
        var users = roomName.split('!~!');
        return users[0] + ' & ' + users[1];
    }
});

app.filter('messageFilter', function () {
    return function (messages, ploneUserid) {
        var result = [];
        var message;
        for(var i = 0; i < messages.length; i++) {
            message = messages[i];
            if(message.private && message.sender === ploneUserid)
                result.push(message);
            else if(! message.private)
                result.push(message);
        }
        return result;
    };
});

app.filter('objectLength', function () {
    return function (obj) {
        if(obj !== undefined) return Object.keys(obj).length;
    };
});

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

// XXX This looks like something to go in an event handler.
//function onRoomSwitch($scope, targetRoom, modified, $rootscope) {
    // var privateChatUser = $scope.privateChatUser;
    // var privateChat = $scope.privateChat;
    // if (targetRoom === 'public') {
    //     if( privateChat && !modified)
    //         userRef.child('rooms').child(privateChatUser).set({
    //             username: privateChatUser,
    //             seen: Date.now()
    //         }); //if we're leaving private to go to public, we've seen the private message
    // }
    // else {
    //     if (privateChat && !modified && privateChatUser) {
    //             userRef.child('rooms').child(privateChatUser).set({
    //                 username: privateChatUser,
    //                 seen: Date.now()
    //             }); //if we're leaving private to go to private, we've seen the private message
    //     }

    //     // XXX This should also be done differently.
    //     var onlineRef = new Firebase($rootScope.firebaseUrl + 'presence');
    //     var userRef = onlineRef.child(username);

    //     userRef.child('rooms').child(targetRoom).set({
    //         username: targetRoom,
    //         seen: Date.now(),
    //         remove: 0
    //     }); //create the new room if one doesn't exist, otherwise it's simply updated
    // }
//}

//function updateUsername($scope, $cookieStore, angularFireCollection) {
    //return;

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
//}
