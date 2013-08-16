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
        $rootScope.fullName = 'Test User ' + rand;
        $rootScope.staticRoot = '../static/'
        $rootScope.portraitRoot = './PORTRAITS_FIXME/';   // TODO XXX set this to the static portrait root
    } else if (! $rootScope.fullName) {
        // if empty full name, substitute with username
        $rootScope.fullName = $rootScope.ploneUserid;
    }

    var staticRoot = $('meta[name="fb-comcentral-static"]').attr('content') || '../static/';
    $rootScope.defaultPortrait = staticRoot + 'defaultPortrait.png';
    //console.log('Portraits:', $rootScope.portraitRoot, $rootScope.defaultPortrait);

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
                    $rootScope.fullName + ') accepted by the server.');
            }
        });
    } else {
        authQ.resolve();
        console.log('No authentication token. Continuing in static mode, acting as user "' +
            $rootScope.ploneUserid + '" (' + $rootScope.fullName + ')');
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
    // store the fullname into the profile
    // this makes sure that every user's fullname is
    // stored or updated on login
    profileRef.child('fullName').set($rootScope.fullName); // XXX XXX force profile/{{username}} to exist
            // XXX I think we should not need to do this for profile to exist, may be a bug in angularFire?
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
                expiration: new Date().valueOf() + $rootScope.serverTimeOffset + $scope.broadcast.expiration * 60000
            });
        };
}]);

app.controller('ViewBroadcastsController',
    ['$scope', '$rootScope', '$q', '$filter', 'AuthService', 'angularFire', 'angularFireCollection',
    function ($scope, $rootScope, $q, $filter, AuthService, angularFire, angularFireCollection) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        $scope.showAll = 'false';
        $scope.filteredBroadcasts = [];
        $scope.unfilteredBroadcasts = angularFireCollection($rootScope.firebaseUrl + 'broadcasts');
        $scope.visibleBroadcasts = $scope.filteredBroadcasts;
        $scope.lastSeen = $rootScope.userProfile.broadcastsSeenTS;

        var broadcastsRef = new Firebase($rootScope.firebaseUrl + 'broadcasts');
        broadcastsRef.on('child_added', function(dataSnapshot) { //this will trigger for each existing child as well
            var newBroadcast = dataSnapshot.val();
            var expired = new Date().valueOf() + $rootScope.serverTimeOffset > newBroadcast.expiration;
            var seen = $scope.lastSeen !== null && newBroadcast.time < $scope.lastSeen;
            if (! expired && ! seen)
                $scope.filteredBroadcasts.push(newBroadcast);
        });

        $scope.toggleShow = function () {
            $scope.visibleBroadcasts = $scope.showAll === 'true' ? $scope.unfilteredBroadcasts : $scope.filteredBroadcasts;
        };

        $scope.markSeen = function () {
            $rootScope.userProfile.broadcastsSeenTS = Firebase.ServerValue.TIMESTAMP;
            $scope.filteredBroadcasts = [];
            $scope.visibleBroadcasts = $scope.filteredBroadcasts;
            $scope.toggleShow();
        };

        $scope.username = $rootScope.ploneUserid;
        var profilePromise = angularFire($rootScope.firebaseUrl + 'profile', $scope, 'userProfiles', {});

        // Moved to broadcast Controller because it may be useful here in future
        /*This will ensure that if an event expires while displayed on the activity stream page, it will dissapear.
          However, this will result in recurring JS calls which may be undesirable and a flicker at every iteration.
          Comment out the setInterval call to disable this functionality */
        //setInterval(refresh, 10000);
        //function refresh() {
        //    $scope.activities = angularFireCollection($rootScope.firebaseUrl + 'activity', function () {
        //        if(!$scope.$$phase) $scope.$apply();
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
    ['$scope', 'angularFire', 'angularFireCollection', 'AuthService', 'createPrivateRoom', '$rootScope',
    function ($scope, angularFire, angularFireCollection, AuthService, createPrivateRoom, $rootScope) {

        // pop up the overlay
        if (window.showFbOverlay) {
            window.showFbOverlay();
        }

        $scope.showAll = 'false';
        $scope.filteredActivities = [];
        $scope.unfilteredActivities = angularFireCollection($rootScope.firebaseUrl + 'activities');
        $scope.visibleActivities = $scope.filteredActivities;
        $scope.lastSeen = $rootScope.userProfile.activitiesSeenTS;

        var activitiesRef = new Firebase($rootScope.firebaseUrl + 'activities');
        activitiesRef.on('child_added', function(dataSnapshot) { //this will trigger for each existing child as well
            var newActivity = dataSnapshot.val();
            if ($scope.lastSeen === undefined || newActivity.time > $scope.lastSeen)
                $scope.filteredActivities.push(newActivity);
        });

        $scope.toggleShow = function () {
            $scope.visibleActivities = $scope.showAll === 'true' ? $scope.unfilteredActivities : $scope.filteredActivities;
        }
        
        $scope.markSeen = function () {
            $rootScope.userProfile.activitiesSeenTS = Firebase.ServerValue.TIMESTAMP;
            $scope.filteredActivities = [];
            $scope.visibleActivities = $scope.filteredActivities;
            $scope.toggleShow();
        };

        $scope.username = $rootScope.ploneUserid;
        var profilePromise = angularFire($rootScope.firebaseUrl + 'profile', $scope, 'userProfiles', {});
        $scope.createPrivateRoom = createPrivateRoom;

        //$scope.updateUsername = function () {
        //    updateUsername($scope, $cookieStore);
        //};
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

        //setUsername($scope, $cookieStore);

        var username = $rootScope.ploneUserid;
        $scope.username = username;

        var onlineRef = new Firebase($rootScope.firebaseUrl + 'presence');

        $scope.helpMessage = {helpClass: 'hidden', help: ''};

        $scope.processMessage = function () {
            var message = parseBBCode($('<div/>').text($scope.message).html()); // escape html inities to prevent script injection, etc.
            processMessage(username, message, $scope.messages, onlineRef, $scope.helpMessage, $location);
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

        var membersPromise = angularFire(currentRoomRef.child('members'), $scope, 'roomMembers', {});
        var usersPromise = angularFire(onlineRef, $scope, 'users', {});
        var profilePromise = angularFire($rootScope.firebaseUrl + 'profile', $scope, 'userProfiles', {});
        $scope.usersType = 'online';
        $scope.userCounts = {};

        $scope.messages = angularFireCollection(currentRoomRef.child('messages').limit(50));

        if (roomType === 'public') {
            $scope.heading = 'Public Chat: ' + $scope.currentRoomName;
        }
        else if (roomType === 'private') {
            var users = $scope.currentRoomName.split('!~!');
            var privateChatUser;
            if (users[0] === username)
                privateChatUser = users[1];
            else if (users[1] == username)
                privateChatUser = users[0];
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
        
        /* This is useful so that in the future we can possibly highlight/distinguish rooms which have messages the user has not yet seen
        currentRoomRef.child('messages').on('child_added', function(dataSnapshot) { //Listen for child_modified as well when editable chat messages revived
            currentRoomRef.child('lastMessaged').set(Firebase.ServerValue.TIMESTAMP);
        }); */

        $scope.createPublicRoom = createPublicRoom;
        $scope.createPrivateRoom = createPrivateRoom;
        $scope.hideRoom = hideRoom;

        $scope.portraitRoot = $rootScope.portraitRoot;
        $scope.defaultPortraitURL = $rootScope.defaultPortrait;

        $scope.$on('$routeChangeStart', function (event, next, current) {
            inRoomRef.remove(); //Remove user from members since they are no longer in the same room
            if(roomType === 'private') onlineRef.off('value', checkOnline); //Stop watching since we are no longer in the same room
        });

        $scope.showMoreMessages = function () {
            $scope.moreMessagesShown = $('#messagesDiv')[0].scrollHeight;
            $scope.messages = angularFireCollection(currentRoomRef.child('messages').limit($scope.messages.length + 25));
        };
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
        $scope.$watch(attrs.autoScroll + '.length', function(newLength, oldLength) {
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
                    if(!$scope.moreMessagesShown)
                        $el[0].scrollTop = $el[0].scrollHeight;
                    else
                        $el[0].scrollTop = $el[0].scrollHeight - $scope.moreMessagesShown;
                    $scope.moreMessagesShown = false;
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
app.directive('contenteditable', ['parseBBCode', function (parseBBCode) {
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
                message.content = parseBBCode($('<div/>').text($.trim(element.text())).html()); // escape html inities to prevent script injection, etc.
                ngModel.$setViewValue(message.content);
                if(message.content === '')
                    $scope.messages.remove(message);
                else 
                    $scope.messages.update(message); //buggy on multiple consecutive edits without time for the other to complete
            });

        }
    };
}]);

app.factory('handleCommand', ['createPrivateRoom', '$rootScope', function (createPrivateRoom, $rootScope) {
    return function (msg, messages, ploneUserid, onlineRef, helpMessage) {
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
                        time: Firebase.ServerValue.TIMESTAMP
                    });
                    $scope.messages.add({
                        sender: ploneUserid,
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
                    target = msg.substr(delim + 1);
                    onlineRef.child(target).once('value', function(dataSnapshot) { // TODO: Restructure using AuthService promises
                        if (dataSnapshot.hasChild('lastActive')) {
                            messages.add({
                                sender: ploneUserid,
                                content: '<span class="server-message-type">whois</span>: <span class="user-reference">' + target + '</span> \
                                     is online and was last active ' + new Date(dataSnapshot.child('lastActive').val()).toString(),
                                private: true,
                                type: 'server',
                                time: Firebase.ServerValue.TIMESTAMP
                            });
                            helpMessage.helpClass = 'info';
                            helpMessage.help = 'Whois query successful';
                        }
                        else if (dataSnapshot.hasChild('logout')) { // TODO: 'logout' does not exist, restructure this using the online markers
                            messages.add({
                                sender: ploneUserid,
                                content: '<span class="server-message-type">whois</span>: <span class="user-reference">' + target + '</span> \
                                     is offline and was last seen ' + new Date(dataSnapshot.child('logout').val()).toString(),
                                private: true,
                                type: 'server',
                                time: Firebase.ServerValue.TIMESTAMP
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
                    helpMessage.helpClass = 'error';
                    helpMessage.help = 'Bad syntax - /time: ' + msg;
                }
                else {
                    messages.add({
                        sender: ploneUserid,
                        content: '<span class="server-message-type">current time</span>: ' + (new Date().valueOf() + $rootScope.serverTimeOffset),
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
    return function (username, message, messages, onlineRef, helpMessage) {
        if (message.indexOf('/') === 0) {
            handleCommand(message, messages, username, onlineRef, helpMessage);
            /*TODO: Fix helpMessage display - changes to $scope.helpMessage are not always detected but wrapping in $scope.$apply 
            is not possible due to firebase callbacks and passing $scope.$apply into handleCommand results in an error */
        }
        else {
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
            message = message.replace(new RegExp('\\[b]([\\s\\S]+?)\\[/b]', 'ig'), '<b>$1</b>')
            message = message.replace(new RegExp('\\[i]([\\s\\S]+?)\\[/i]', 'ig'), '<i>$1</i>')
            message = message.replace(new RegExp('\\[u]([\\s\\S]+?)\\[/u]', 'ig'), '<u>$1</u>')
            message = message.replace(new RegExp('\\[s]([\\s\\S]+?)\\[/s]', 'ig'), '<s>$1</s>')
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
            if(users[username].online) {
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
        for (var username in users)
            counter++;
        userCounts.roomMembers = counter; // This is a simple and efficient method to avoid Object.keys()
        return users;
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

app.filter('getFullName', function () {
    return function (sender, userProfiles) {
        if(userProfiles !== undefined) {
            if(userProfiles[sender] && userProfiles[sender].fullName)
                return userProfiles[sender].fullName;
        }
        return sender;
    };
});

app.directive('ngEnter', function() {
    return function(scope, element, attrs) {
        element.bind("keydown", function(event) {
            if(event.which === 13) {
                scope.$apply(function(){
                    scope.$eval(attrs.ngEnter);
                });
                return false;
            }
        });
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
