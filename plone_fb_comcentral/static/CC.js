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

    $routeProvider

        .when('/', {templateUrl: staticRoot + 'partials/fb_comcentral.html',
            controller: 'CommandCentralController'
        })

        .when('/activity', {
            templateUrl: staticRoot + 'partials/fb_activity.html',
            controller: 'ActivityStreamController',
            activetab: 'activityStream'
        })

        .when('/messaging/public/:room', {
            templateUrl: staticRoot + 'partials/fb_messaging.html',
            controller: 'PublicMessagingController',
            activetab: 'messaging'
        })

        .when('/messaging/private/:room', {
            templateUrl: staticRoot + 'partials/fb_messaging.html',
            controller: 'PrivateMessagingController',
            activetab: 'messaging'
        })

        .when('/simulate_activity', {
            templateUrl: staticRoot + 'partials/fb_simulate_activity.html',
            controller: 'SimulateActivityController',
            activetab: 'simulateActivity'
        })

        .when('/create_broadcast', {
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
            $rootScope.ploneUserid = 'TestUser' + Math.floor(Math.random()*101); // Vary userid to make testing easier
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
    '$routeParams', '$location', '$cookieStore', '$document',
    'authService', 'handleCommand', 'createPublicRoom', 'createPrivateRoom', 'hideRoom', 'processMessage', '$rootScope',
    function ($scope, $timeout, angularFire, angularFireCollection, $q,
        $routeParams, $location, $cookieStore, $document,
        authService, handleCommand, createPublicRoom, createPrivateRoom, hideRoom, processMessage, $rootScope) {

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
        $scope.currentRoomName = $routeParams.room;

        var currentRoomRef = new Firebase($rootScope.firebaseUrl + 'rooms/publicRooms/' + $scope.currentRoomName);
        var promise = angularFire(currentRoomRef.child('members'), $scope, 'members', {});
        currentRoomRef.child('name').set($scope.currentRoomName);
        currentRoomRef.child('type').set('public');
        currentRoomRef.child('hidden').child(username).remove(); //If we are in the room, we do not want it hidden - this will allow reentering a hidden room
        $scope.messages = angularFireCollection(currentRoomRef.child('messages').limit(500));
        $scope.heading = 'Public Chat: ' + $scope.currentRoomName;

        var inRoomRef = currentRoomRef.child('members').push(username);
        inRoomRef.onDisconnect().remove();
        currentRoomRef.child('messages').on('child_added', function(dataSnapshot) { //Listen for child_modified as well when editable chat messages revived
            currentRoomRef.child('lastMessaged').set(Firebase.ServerValue.TIMESTAMP);
        });
        currentRoomRef.child('members').on('value', function(dataSnapshot) {
            $scope.numMembers = ' (' + (dataSnapshot.val() ? Object.keys(dataSnapshot.val()).length : 0) + ')';
        });

        $scope.createPublicRoom = createPublicRoom;
        $scope.createPrivateRoom = createPrivateRoom;
        
        $scope.hideRoom = function (roomType, roomName) {
            hideRoom(roomType, roomName, $scope.username, $rootScope.firebaseUrl);
            $location.url('/messaging/public/main'); //Since current room is hidden, redirect to main (which cannot be hidden)
        };

        $scope.$watch(function () {
            return $location.path();
        }, function (newValue, oldValue) {
            if(newValue !== oldValue) inRoomRef.remove(); //Remove user from members if they are no longer on the same page
        });

        /* not working... angular.element($document).ready(function () {
            $(document).on('[contenteditable="true"]', 'keydown', function(e) {
                console.log('hi');
                if(e.which == 13) {
                    $(this).blur(); //let directive handle the rest
                    return false; //prevent enter from being added to message content
                }
            });
        }); */
    }
]);

app.controller('PrivateMessagingController',
    ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    '$routeParams', '$location', '$cookieStore', '$document',
    'authService', 'handleCommand', 'createPublicRoom', 'createPrivateRoom', 'hideRoom', 'processMessage', '$rootScope',
    function ($scope, $timeout, angularFire, angularFireCollection, $q,
        $routeParams, $location, $cookieStore, $document,
        authService, handleCommand, createPublicRoom, createPrivateRoom, hideRoom, processMessage, $rootScope) {

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
    
        $scope.rooms = angularFireCollection($rootScope.firebaseUrl + 'rooms');
        $scope.publicRooms = angularFireCollection($rootScope.firebaseUrl + 'rooms/publicRooms');
        $scope.privateRooms = angularFireCollection($rootScope.firebaseUrl + 'rooms/privateRooms');
        $scope.currentRoomName = $routeParams.room;

        var currentRoomRef = new Firebase($rootScope.firebaseUrl + 'rooms/privateRooms/' + $scope.currentRoomName);
        var promise = angularFire(currentRoomRef.child('members'), $scope, 'members', {});
        currentRoomRef.child('name').set($scope.currentRoomName);
        currentRoomRef.child('type').set('private');
        currentRoomRef.child('hidden').child(username).remove(); //If we are in the room, we do not want it hidden - this will allow reentering a hidden room
        $scope.messages = angularFireCollection(currentRoomRef.child('messages').limit(500));

        var users = $scope.currentRoomName.split('!~!');
        var privateChatUser = users[0] === username ? users[1] : users[0]; // TODO: Kick out user if he/she doesn't belong
        $scope.heading = 'Private Chat with ' + privateChatUser;

        var inRoomRef = currentRoomRef.child('members').push(username);
        inRoomRef.onDisconnect().remove();
        currentRoomRef.child('messages').on('child_added', function(dataSnapshot) { //Listen for child_modified as well when editable chat messages revived
            currentRoomRef.child('lastMessaged').set(Firebase.ServerValue.TIMESTAMP);
        });
        currentRoomRef.child('members').on('value', function(dataSnapshot) {
            $scope.numMembers = ' (' + (dataSnapshot.val() ? Object.keys(dataSnapshot.val()).length : 0) + ')';
        });

        var checkOnline = onlineRef.child(privateChatUser).on('value', function (dataSnapshot) {
            $scope.info = 'User is <strong>' + (dataSnapshot.hasChild('online') ? 'online' : 'offline') + '</strong>';
        });

        $scope.createPublicRoom = createPublicRoom;
        $scope.createPrivateRoom = createPrivateRoom;
        
        $scope.hideRoom = function (roomType, roomName) {
            hideRoom(roomType, roomName, $scope.username, $rootScope.firebaseUrl);
            $location.url('/messaging/public/main'); //Since current room is hidden, redirect to main (which cannot be hidden)
        };

        $scope.$watch(function () {
            return $location.path();
        }, function (newValue, oldValue) {
            if(newValue !== oldValue) {
                inRoomRef.remove(); //Remove user from members if they are no longer on the same page
                onlineRef.off('value', checkOnline); //Stop watching since we are no longer on the same page
            }
        });
    }
]);

function handleMessageEdit(e) {
    if(e.which == 13) {
        $(e.srcElement).blur(); //let contenteditable directive handle the rest
        return false; //prevent line break from being added to message content
    }
}

//TODO: Does not work with a filter
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

app.factory('handleCommand', function() {
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
                        var roomName = ploneUserid < target ? ploneUserid + '!~!' + target : ploneUserid + '!~!' + target;
                        $location.url('/messaging/private/' + roomName); //This has the intended side effect of reopening created rooms (including hidden ones)
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
});

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

app.factory('hideRoom', function() {
    return function (roomType, roomName, username, firebaseUrl) {
        var roomsRef = new Firebase(firebaseUrl + 'rooms');
        roomsRef.child(roomType + 'Rooms').child(roomName).child('hidden').child(username).set(Firebase.ServerValue.TIMESTAMP);
    };
});

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

app.filter('publicRoomFilter', function() {
    return function (rooms, ploneUserid) {
        var result = [];
        for (var i = 0; i < rooms.length; i++) {
            var room = rooms[i];
            if ((room.hidden && room.hidden[ploneUserid] && room.lastMessaged > room.hidden[ploneUserid]) || !room.hidden)
                result.push(room); //if either it is hidden and there is a message newer than the time of hiding or it was not hidden
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
            if (inPrivateRoom && ((room.hidden && room.hidden[ploneUserid] && room.lastMessaged > room.hidden[ploneUserid]) || !room.hidden))
                result.push(room); //if either it is hidden and there is a message newer than the time of hiding or it was not hidden
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

app.filter('millisToReadableDate', function() {
    return function(date) {
        return new Date(date).toString();
    };
});

app.filter('prettifyRoomName', function() {
    return function(roomName) {
        var users = roomName.split('!~!');
        return users[0] + ' & ' + users[1];
    }
});

app.filter('timeFromNow', function () {
    return function (date) {
        return (date - Date.now())/1000 + ' seconds'; //This can be easily improved to increase verbosity
    };
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