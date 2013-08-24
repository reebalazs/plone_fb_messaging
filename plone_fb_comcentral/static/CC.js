var app = angular.module('commandCentral', ['firebase', 'ngCookies', 'monospaced.elastic']);

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
      // need to use '*' as a prefix to distinguish from Plone,
      // as Plone's TOC uses already '!'
      .hashPrefix('*');

    // this is needed to inject AuthService in here
    function authResolve (AuthService) {
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

app.service('AuthService', ['$rootScope', 'angularFire', '$q', '$cookieStore', '$http', 'setupUser',
    function ($rootScope, angularFire, $q, $cookieStore, $http, setupUser) {
    // Configure parameters. In Plone these are provided from the template by ng-init.

    var credsQ = $q.defer(),
        optionsQ = $q.defer(),
        serverTimeOffsetQ = $q.defer(),
        authQ = $q.defer(),    // XX Not sure if we need to Q for auth.
        userProfileQ = $q.defer();

    // promise will satisfy when both serverTimeOffset and userProfile are read and firebase ref is established
    this.promise = $q.all([
        authQ.promise, // XXX not sure if needed, and if not then whether it causes trouble
        serverTimeOffsetQ.promise,
        credsQ.promise,
        optionsQ.promise,
        userProfileQ.promise // not using userProfilePromise for simplicity
    ]);

    var staticRoot = $('meta[name="fb-comcentral-static"]').attr('content') || '../static/';
    $rootScope.defaultPortrait = staticRoot + 'defaultPortrait.png';
    //console.log('Portraits:', $rootScope.portraitRoot, $rootScope.defaultPortrait);

    if (!$rootScope.firebaseUrl) {
        // We are in the static html. Let's provide
        // constants for testing.

        $rootScope.testingMode = true;
        $rootScope.authToken = '';
        $rootScope.staticRoot = '../static/';
        $rootScope.portraitRoot = './PORTRAITS_FIXME/';   // TODO XXX set this to the static portrait root

        $.getJSON($rootScope.staticRoot + 'options.json', function (data) {
            $rootScope.firebaseUrl = data.firebaseUrl;
            optionsQ.resolve();
        }).error(function () {
            throw new Error('Failed to fetch options.json');
        });

        var userCredsCookie = $cookieStore.get('userCredentials'), userCreds;
        if (userCredsCookie) {
            userCreds = JSON.parse(userCredsCookie);
        }

        if (userCreds && userCreds.serverId && userCreds.userId && userCreds.fullName) {
            setupUser(userCreds.serverId, userCreds.userId, userCreds.fullName, false);
        }
        else {
            var randUser = Math.floor(Math.random() * 101), // Vary userId to make testing easier
                randServer = Math.floor(Math.random() * 101);
            setupUser('TestingServer' + randServer, 'TestUser' + randUser, 'Test User ' + randUser, true);
        }
        credsQ.resolve();
    }
    else {
        optionsQ.resolve();
        credsQ.resolve();
        if (!$rootScope.fullName) {
            // if empty full name, substitute with username --- Why?? current code will just not show it
            $rootScope.fullName = $rootScope.userId; 
        }
    }

    optionsQ.promise.then(function () {
        console.log('Using Firebase URL: "' + $rootScope.firebaseUrl + '".');
        $rootScope.fireBase = new Firebase($rootScope.firebaseUrl);

        $rootScope.fireBase.root().child('.info').child('serverTimeOffset').on('value', function (snap) {
            $rootScope.serverTimeOffset = snap.val();
            serverTimeOffsetQ.resolve();
        });
    });

    var readyToAuth = $q.all([
        credsQ.promise,
        optionsQ.promise
    ]);

    readyToAuth.then(function () {
        var firebase = $rootScope.fireBase;
        var userCredsString =  $rootScope.serverId + ':' + $rootScope.userId + 
            ($rootScope.fullName ? ' (' + $rootScope.fullName + ')' : '');

        // Authenticate me.
        if ($rootScope.authToken) {
            $rootScope.fireBase.auth($rootScope.authToken, function (error, result) {
                if (error) {
                    throw new Error('Authentication as "' + userCredsString + '" failed! \n' + error);
                }
                else {
                    authQ.resolve();
                    console.log('Authentication as "' + userCredsString + '" accepted by the server.');
                }
            });
        }
        else {
            authQ.resolve();
            console.log('No authentication token. Continuing in static mode, acting as "' + userCredsString + '"');
        }
    });

    authQ.promise.then(function () {
        // presence handling
        var username = $rootScope.serverId + ':' + $rootScope.userId,
            firebase = $rootScope.fireBase,
            onlineRef = firebase.child('presence'),
            infoRef = firebase.root().child('.info');

        infoRef.child('connected').on('value', function (snap) {
            if (snap.val() === true) {
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

        // profile handling
        var profileRef = firebase.child('profile').child(username);
        // store the fullname into the profile
        // this makes sure that every user's fullname is
        // stored or updated on login
        profileRef.child('fullName').set($rootScope.fullName); // XXX XXX force profile/{{username}} to exist
                // XXX I think we should not need to do this for profile to exist, may be a bug in angularFire?
        if ($rootScope.portraitUrl) {
            profileRef.child('portraitUrl').set($rootScope.portraitUrl);
        }
        var userProfilePromise = angularFire(profileRef, $rootScope, 'userProfile', {});
        userProfilePromise.then(function () {
            userProfileQ.resolve();
        });
    });
}]);

app.service('StreamService', ['$rootScope', 'AuthService', function ($rootScope, AuthService) {
    $rootScope.streamCounts = {};
    $rootScope.filteredActivities = [];
    $rootScope.filteredBroadcasts = [];

    AuthService.promise.then(function () {
        var broadcastsRef = new Firebase($rootScope.firebaseUrl + 'broadcasts');
        broadcastsRef.on('child_added', function (dataSnapshot) { //this will trigger for each existing child as well
            var newBroadcast = dataSnapshot.val();
            var broadcastsLastSeen = $rootScope.userProfile.broadcastsSeenTS;
            var expired = new Date().valueOf() + $rootScope.serverTimeOffset > newBroadcast.expiration;
            var seen = broadcastsLastSeen !== null && newBroadcast.time < broadcastsLastSeen;
            if (!expired && !seen) {
                $rootScope.filteredBroadcasts.push(newBroadcast);
            }
            $rootScope.streamCounts.numBroadcasts = $rootScope.filteredBroadcasts.length;
        });

        var activitiesRef = new Firebase($rootScope.firebaseUrl + 'activities');
        activitiesRef.on('child_added', function (dataSnapshot) { //this will trigger for each existing child as well
            var newActivity = dataSnapshot.val();
            var activitiesLastSeen = $rootScope.userProfile.activitiesSeenTS;
            if (activitiesLastSeen === undefined || newActivity.time > activitiesLastSeen) {
                $rootScope.filteredActivities.push(newActivity);
            }
            $rootScope.streamCounts.numActivites = $rootScope.filteredActivities.length;
        });
    });
}]);

app.controller('CommandCentralController',
    ['$scope', '$rootScope', '$cookieStore', 'setupUser',
    function ($scope, $rootScope, $cookieStore, setupUser) {

        with ($rootScope) {
            $scope.testingMode = testingMode;
            $scope.userId = userId;
            $scope.serverId = serverId;
            $scope.fullName = fullName;
        }
        
        $scope.changeUser = function () {
            setupUser($scope.serverId, $scope.userId, $scope.fullName, true);
            location.reload(); //Simple in order to not bother with refreshing all data and changing the connection details
        };
}]);

app.controller('MenuController',
    ['$scope', '$route', '$rootScope', 'AuthService', 'StreamService',
    function ($scope, $route, $rootScope, AuthService, StreamService) {
        $scope.$route = $route;
        $scope.streamCounts = {numActivites: 0, numBroadcasts: 0};

        AuthService.promise.then(function () {
            $rootScope.$watch('streamCounts', function () {
                $scope.streamCounts = $rootScope.streamCounts;
                setTimeout(function () {
                    // there should be a better way to do this but I'll leave it for the moment because it works
                    $scope.$apply();
                }, 1000);
            }, true);
        });
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
                user: $rootScope.serverId + ':' + $rootScope.userId,
                expiration: new Date().valueOf() + $rootScope.serverTimeOffset + $scope.broadcast.expiration * 60000
            });
        };
}]);

app.controller('ViewBroadcastsController',
    ['$scope', '$rootScope', '$q', '$filter', 'AuthService', 'angularFire', 'angularFireCollection', 'StreamService',
    function ($scope, $rootScope, $q, $filter, AuthService, angularFire, angularFireCollection, StreamService) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        $scope.showAll = 'false';
        $scope.filteredBroadcasts = $rootScope.filteredBroadcasts;
        $scope.unfilteredBroadcasts = angularFireCollection($rootScope.firebaseUrl + 'broadcasts');
        $scope.visibleBroadcasts = $scope.filteredBroadcasts;

        $scope.toggleShow = function () {
            $scope.visibleBroadcasts = $scope.showAll === 'true' ? $scope.unfilteredBroadcasts : $scope.filteredBroadcasts;
        };

        $scope.markSeen = function () {
            $rootScope.userProfile.broadcastsSeenTS = new Date().valueOf() + $rootScope.serverTimeOffset;
            $rootScope.filteredBroadcasts.length = 0; //Clear but maintain references
            $rootScope.streamCounts.numBroadcasts = 0;
            $scope.toggleShow();
        };

        $scope.username = $rootScope.userId;
        var profilePromise = angularFire($rootScope.firebaseUrl + 'profile', $scope, 'userProfiles', {});

        /*This will ensure that if an event expires while displayed on the activity stream page, it will dissapear.
          However, this will result in recurring JS calls which may be undesirable and a flicker at every iteration.
          Comment out the setInterval call to disable this functionality */
        //setInterval(refresh, 10000);
        //function refresh () {
        //    $scope.activities = angularFireCollection($rootScope.firebaseUrl + 'activity', function () {
        //        if (!$scope.$$phase) $scope.$apply();
        //    });
        //}
}]);

// XXX this is only needed for the simulation and will go away in the final product.
app.controller('SimulateActivityController',
    ['$scope', '$rootScope', '$http',
    function ($scope, $rootScope, $http) {
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
    ['$scope', 'angularFire', 'angularFireCollection', 'AuthService', 'createPrivateRoom', '$rootScope', 'StreamService',
    function ($scope, angularFire, angularFireCollection, AuthService, createPrivateRoom, $rootScope, StreamService) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        $scope.showAll = 'false';
        $scope.filteredActivities = $rootScope.filteredActivities;
        $scope.unfilteredActivities = angularFireCollection($rootScope.firebaseUrl + 'activities');
        $scope.visibleActivities = $scope.filteredActivities;

        $scope.toggleShow = function () {
            $scope.visibleActivities = $scope.showAll === 'true' ? $scope.unfilteredActivities : $scope.filteredActivities;
        };

        $scope.markSeen = function () {
            $rootScope.userProfile.activitiesSeenTS = new Date().valueOf() + $rootScope.serverTimeOffset;
            $rootScope.filteredActivities.length = 0; //Clear but maintain references
            $rootScope.streamCounts.numActivites = 0;
            $scope.toggleShow();
        };

        $scope.username = $rootScope.serverId + ':' + $rootScope.userId;
        var profilePromise = angularFire($rootScope.firebaseUrl + 'profile', $scope, 'userProfiles', {});
        $scope.createPrivateRoom = createPrivateRoom;
    }
]);

app.controller('MessagingController',
    ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q', '$routeParams', '$location', '$cookieStore', '$rootScope',
    'handleCommand', 'createPublicRoom', 'createPrivateRoom', 'hideRoom', 'processMessage', 'parseBBCode',
    function ($scope, $timeout, angularFire, angularFireCollection, $q, $routeParams, $location, $cookieStore, $rootScope,
        handleCommand, createPublicRoom, createPrivateRoom, hideRoom, processMessage, parseBBCode) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        // focus to messages input
        $('#fb-message-input')[0].focus();

        var username = $rootScope.serverId + ':' + $rootScope.userId;
        $scope.username = username;

        var onlineRef = new Firebase($rootScope.firebaseUrl + 'presence');

        $scope.helpMessage = {helpClass: 'hidden', help: ''};

        $scope.processMessage = function () {
            $scope.markRoomSeen();
            currentRoomRef.child('lastMessaged').set(Firebase.ServerValue.TIMESTAMP);
            var message = parseBBCode($('<div/>').text($scope.message).html()); // escape html inities to prevent script injection, etc.
            processMessage(username, message, $scope.messages, $scope.users, $scope.helpMessage, $location);
            $scope.message = ''; //clear message input
        };

        $scope.rooms = angularFireCollection($rootScope.firebaseUrl + 'rooms');
        $scope.publicRooms = angularFireCollection($rootScope.firebaseUrl + 'rooms/publicRooms');
        $scope.privateRooms = angularFireCollection($rootScope.firebaseUrl + 'rooms/privateRooms');
        $scope.currentRoomName = $routeParams.roomName;

        var roomType = $routeParams.roomType;
        var currentRoomRef = new Firebase($rootScope.firebaseUrl + 'rooms').child(roomType + 'Rooms').child($scope.currentRoomName);
        currentRoomRef.child('name').set($scope.currentRoomName);
        currentRoomRef.child('type').set(roomType);
        currentRoomRef.child('hidden').child(username).remove(); //If we are in the room, we do not want it hidden - this will allow reentering a hidden room

        var membersPromise = angularFire(currentRoomRef.child('members'), $scope, 'roomMembers', {}),
            usersPromise = angularFire(onlineRef, $scope, 'users', {}),
            profilePromise = angularFire($rootScope.firebaseUrl + 'profile', $scope, 'userProfiles', {});
        $scope.usersType = 'online';
        $scope.userCounts = {};

        $scope.messages = angularFireCollection(currentRoomRef.child('messages').limit(50));

        if (roomType === 'public') {
            $scope.heading = 'Public Chat: ' + $scope.currentRoomName;
        }
        else if (roomType === 'private') {
            var users = $scope.currentRoomName.split('!~!');
            var privateChatUser;
            if (users[0] === username) {
                privateChatUser = users[1];
            }
            else if (users[1] === username) {
                privateChatUser = users[0];
            }
            else {
                $location.url('/messaging/public/main');
                throw new Error('Not a member of private chat: ' + $scope.currentRoomName); // Of course, this offers no security
            }
            $scope.heading = 'Private Chat with ' + privateChatUser;

            var checkOnline = onlineRef.child(privateChatUser).on('value', function (dataSnapshot) {
                $scope.info = 'User is <span class="user-status-marker">' + (dataSnapshot.hasChild('online') ? 'online' : 'offline') + '</span>';
            });
        }

        var inRoomRef = currentRoomRef.child('members').child(username).push(1);
        inRoomRef.onDisconnect().remove();

        $scope.createPublicRoom = createPublicRoom;
        $scope.createPrivateRoom = createPrivateRoom;
        $scope.hideRoom = hideRoom;

        $scope.$on('$routeChangeStart', function (event, next, current) {
            $scope.markRoomSeen(); //Hopefully the user has seen everything in this room if he/she is leaving
            inRoomRef.remove(); //Remove user from members since they are no longer in the same room
            if (roomType === 'private') {
                onlineRef.off('value', checkOnline); //Stop watching since we are no longer in the same room
            }
        });

        $scope.showMoreMessages = function () {
            $scope.moreMessagesShown = $('#messagesDiv')[0].scrollHeight;
            $scope.messages = angularFireCollection(currentRoomRef.child('messages').limit($scope.messages.length + 25));
        };

        $scope.getPortraitURL = function (username) {
            if($scope.userProfiles && $scope.userProfiles[username] && $scope.userProfiles[username].portraitURL) {
                return $scope.userProfiles[username].portraitURL;
            }
            else {
                return $rootScope.defaultPortrait;
            }
        };

        $scope.markRoomSeen = function () {
            currentRoomRef.child('seen').child(username).set(Firebase.ServerValue.TIMESTAMP);
        };
        $scope.markRoomSeen();
        currentRoomRef.child('seen').child(username).onDisconnect().set(Firebase.ServerValue.TIMESTAMP);
    }
]);

app.directive('autoScroll', function ($timeout) {
    return function ($scope, $el, attrs) {
        var timer = false;
        // remember the minimal length during a batch of continous changes
        // because we want to wait until the changes are over, and only
        // scroll once in the end. This is most important when firebase
        // loads a long list of items.
        var minimalLength;
        $scope.$watch(attrs.autoScroll + '.length', function (newLength, oldLength) {
            if (newLength === oldLength) {
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
            }
            else {
                // the new batch of length changes start now
                minimalLength = oldLength;
            }
            timer = $timeout(function () {
                if (newLength - minimalLength > 5) {
                    // big increase and initial load: jump to end
                    if ($scope.moreMessagesShown) {
                        $el[0].scrollTop = $el[0].scrollHeight - $scope.moreMessagesShown;
                        $scope.moreMessagesShown = false;
                    }
                    else {
                        $el[0].scrollTop = $el[0].scrollHeight;
                    }
                }
                else {
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
app.directive('contenteditable', ['parseBBCode', function (parseBBCode) {
    return {
        restrict: 'A',
        require: '?ngModel',
        link: function ($scope, element, attrs, ngModel) {

            $(element).on('keydown', function (e) {
                if (e.which === 13) {
                    $(this).blur(); //let directive handle the rest
                    return false; //prevent enter from being added to message content
                }
            });

            ngModel.$render = function () {
                element.html(ngModel.$viewValue.content || '');
            };

            element.bind('blur', function () {
                var message = ngModel.$modelValue;
                message.content = parseBBCode($('<div/>').text($.trim(element.text())).html()); // escape html inities to prevent script injection, etc.
                ngModel.$setViewValue(message.content);
                if (message.content === '') {
                    $scope.messages.remove(message);
                }
                else {
                    $scope.messages.update(message); //buggy on multiple consecutive edits without time for the other to complete
                }
            });
        }
    };
}]);

app.factory('setupUser', ['$cookieStore', '$rootScope', function ($cookieStore, $rootScope) {
    return function (serverId, userId, fullName, setCookie) {
        var regExp = new RegExp('[a-zA-Z0-9.-_]+$');
        if (serverId.search(regExp) === 0 && userId.search(regExp) === 0) {
            $rootScope.serverId = serverId;
            $rootScope.userId = userId;
            $rootScope.fullName = fullName;

            if (setCookie) {
                $cookieStore.put('userCredentials', JSON.stringify({
                    serverId: serverId,
                    userId: userId,
                    fullName: fullName
                }));
            }
        }
        else {
            throw new Error('Invalid User Credentials');
        }
    };
}]);

app.factory('handleCommand', ['createPrivateRoom', '$rootScope', function (createPrivateRoom, $rootScope) {
    return function (msg, messages, username, users, helpMessage) {
        var delim = msg.indexOf(' ');
            command = delim !== -1 ? msg.substring(1, delim) : msg.substr(1),
            usernameRegexp = new RegExp('[a-zA-Z0-9.-_]+:[a-zA-Z0-9.-_]+$'),
            usernameRegexpSource = usernameRegexp.source.slice(0, -1); //remove last $ character to allow command to continue

        switch (command) {
            /* case 'msg':
                if (msg.search('/msg\\s' + usernameRegexpSource + '\\s.+') !== 0) {
                    $scope.helpClass = 'error';
                    $scope.help = 'Bad syntax - /msg {target username} {message}';
                }
                else {
                    var delim2 = msg.indexOf(' ', delim + 1);
                    target = msg.substring(delim + 1, delim2);
                    var message = encodeHTML(msg.substr(delim2 + 1));

                    $scope.messages.add({
                        sender: userId,
                        content: message,
                        private: true,
                        type: 'private',
                        recipient: target,
                        time: Firebase.ServerValue.TIMESTAMP
                    });
                    $scope.messages.add({
                        sender: userId,
                        recipient: privateChat ? privateChatUser : username,
                        content: 'private message sent to <em>' + target + '</em>: "' + message + '"',
                        private: true,
                        privateChat: privateChat,
                        type: 'server',
                        time: Firebase.ServerValue.TIMESTAMP
                    });
                    $scope.helpClass = 'info';
                    $scope.help = 'Message sent to ' + target;
                }
                break; */
            case 'query':
                if (msg.search('/query\\s' + usernameRegexpSource + '$') !== 0) {
                    helpMessage.helpClass = 'error';
                    helpMessage.help = 'Bad syntax - /query {target username}: ' + msg;
                }
                else {
                    target = msg.substr(delim + 1);
                    if (target !== username) {
                        helpMessage.helpClass = 'info';
                        helpMessage.help = 'Opened private chat room with ' + target;
                        createPrivateRoom(username, target);
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
                        sender: username,
                        content: action,
                        private: false,
                        type: 'action',
                        time: Firebase.ServerValue.TIMESTAMP
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
                    var target = msg.substr(delim + 1);
                    if (users[target] && users[target].lastActive) {
                        if (users[target].online) {
                            messages.add({
                                sender: username,
                                content: '<span class="server-message-type">whois</span>: <span class="user-reference">' + target + '</span>' +
                                    'is online and was last active ' + new Date(users[target].lastActive).toString(),
                                private: true,
                                type: 'server',
                                time: Firebase.ServerValue.TIMESTAMP
                            });
                        }
                        else {
                            messages.add({
                                sender: username,
                                content: '<span class="server-message-type">whois</span>: <span class="user-reference">' + target + '</span>' +
                                    'is offline and was last seen ' + new Date(users[target].lastActive).toString(),
                                private: true,
                                type: 'server',
                                time: Firebase.ServerValue.TIMESTAMP
                            });
                        }
                        helpMessage.helpClass = 'info';
                        helpMessage.help = 'Whois query successful';
                    }
                    else {
                        helpMessage.helpClass = 'error';
                        helpMessage.help = 'Whois query unsuccessful: ' + msg;
                    }
                }
                break;
            case 'time':
                if (msg.search('/time$') !== 0) {
                    helpMessage.helpClass = 'error';
                    helpMessage.help = 'Bad syntax - /time: ' + msg;
                }
                else {
                    messages.add({
                        sender: username,
                        content: '<span class="server-message-type">current time</span>: ' +
                            new Date((new Date().valueOf() + $rootScope.serverTimeOffset)).toString(),
                        private: true,
                        type: 'server',
                        time: Firebase.ServerValue.TIMESTAMP
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
    };
}]);

app.factory('createPrivateRoom', ['$location', function ($location) {
    return function (username, privateChatUser) {
        if (privateChatUser === username) {
            throw new Error('Cannot private chat with yourself');
        }
        var newRoomName = username < privateChatUser ? username + '!~!' + privateChatUser : privateChatUser + '!~!' + username;
        $location.url('/messaging/private/' + newRoomName); //This has the intended side effect of reopening created rooms (including hidden ones)
    };
}]);

app.factory('hideRoom', ['$location', '$rootScope', function ($location, $rootScope) {
    return function (roomType, roomName, username, currentRoomName) {
        var roomsRef = new Firebase($rootScope.firebaseUrl + 'rooms');
        roomsRef.child(roomType + 'Rooms').child(roomName).child('hidden').child(username).set(Firebase.ServerValue.TIMESTAMP);
        if (currentRoomName === roomName) {
            $location.url('/messaging/public/main'); //Since current room is hidden, redirect to main (which cannot be hidden)
        }
    };
}]);

app.factory('processMessage', ['handleCommand', function (handleCommand) {
    return function (username, message, messages, onlineRef, helpMessage) {
        if (message.indexOf('/') === 0) {
            handleCommand(message, messages, username, onlineRef, helpMessage);
        }
        else if (message.length > 0) {
            messages.add({
                sender: username,
                content: message,
                private: false,
                type: 'public',
                time: Firebase.ServerValue.TIMESTAMP
            });
            helpMessage.helpClass = 'hidden';
        }
    };
}]);

app.factory('parseBBCode', function () {
    return function (message) {
        if (message.indexOf('[') !== -1) {
            message = message.replace(new RegExp('\\[b]([\\s\\S]+?)\\[/b]', 'ig'), '<b>$1</b>');
            message = message.replace(new RegExp('\\[i]([\\s\\S]+?)\\[/i]', 'ig'), '<i>$1</i>');
            message = message.replace(new RegExp('\\[u]([\\s\\S]+?)\\[/u]', 'ig'), '<u>$1</u>');
            message = message.replace(new RegExp('\\[s]([\\s\\S]+?)\\[/s]', 'ig'), '<s>$1</s>');
            message = message.replace(new RegExp('\\[url]([\\s\\S]+?)\\[/url]', 'ig'), '<a href="$1">$1</a>');
            message = message.replace(new RegExp('\\[url=(.+)]([\\s\\S]+?)\\[/url]'), '<a href="$1">$2</a>');
        }
        return message;
    };
});

app.filter('userFilter', function () {
    return function (users, userCounts) {
        var result = {};
        var counter = 0;
        for (var username in users) {
            if (users[username].online) {
                result[username] = users[username];
                counter++;
            }
        }
        userCounts.onlineUsers = counter; // This is a simple and efficient method to avoid Object.keys()
        return result;
    };
});

app.filter('roomMemberFilter', function () {
    return function (users, userCounts) {
        var counter = 0;
        for (var username in users) {
            counter++;
        }
        userCounts.roomMembers = counter; // This is a simple and efficient method to avoid Object.keys()
        return users;
    };
});

app.filter('publicRoomFilter', function () {
    return function (rooms, username) {
        var result = [];
        for (var i = 0; i < rooms.length; i++) {
            var room = rooms[i];
            var roomHidden = room.hidden && room.hidden.hasOwnProperty(username) && (room.lastMessaged === undefined || room.lastMessaged < room.hidden[username]);
            if (!roomHidden) {
                result.push(room);
            }
        }
        return result;
    };
});

app.filter('privateRoomFilter', function () {
    return function (rooms, username) {
        var result = [];
        for (var i = 0; i < rooms.length; i++) {
            var room = rooms[i];
            var members = room.name.split('!~!');
            var inPrivateRoom = members[0] === username || members[1] === username; //if this user is a member of the conversation
            var roomHidden = room.hidden && room.hidden.hasOwnProperty(username) && (room.lastMessaged === undefined || room.lastMessaged < room.hidden[username]);
            if (inPrivateRoom && !roomHidden) {
                result.push(room);
            }
        }
        return result;
    };
});

app.filter('prettifyRoomName', function () {
    return function (roomName) {
        var users = roomName.split('!~!');
        return users[0] + ' & ' + users[1];
    };
});

app.filter('messageFilter', function () {
    return function (messages, userId) {
        var result = [];
        var message;
        for(var i = 0; i < messages.length; i++) {
            message = messages[i];
            if (message.private && message.sender === userId) {
                result.push(message);
            }
            else if (!message.private) {
                result.push(message);
            }
        }
        return result;
    };
});

app.filter('getFullName', function () {
    return function (sender, userProfiles) {
        if (userProfiles !== undefined) {
            if (userProfiles[sender] && userProfiles[sender].fullName) {
                return userProfiles[sender].fullName;
            }
        }
        return sender;
    };
});

app.directive('ngEnter', function () {
    return function (scope, element, attrs) {
        element.bind("keydown", function (event) {
            if (event.which === 13) {
                scope.$apply(function () {
                    scope.$eval(attrs.ngEnter);
                });
                return false;
            }
        });
    };
});