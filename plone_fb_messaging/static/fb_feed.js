var app = angular.module('addActivity', ['firebase']);
var firebaseURL = 'https://sushain.firebaseio.com/';

app.controller('AddActivityController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {
        $scope.eventType = 't1'; //Prevent Angular from adding a blank option
        $scope.activities = angularFireCollection(firebaseURL + 'activity');
        $scope.addActivity = function() {
            var expiration = Date.now() + ($scope.minutes === undefined ? 0 : $scope.minutes) * 60000 
                                        + ($scope.hours === undefined ? 0 : $scope.hours)  * 3600000 
                                        + ($scope.days === undefined ? 0 : $scope.days) * 86400000 
                                        + ($scope.months === undefined ? 0 : $scope.months) * 2.62974e9; //Meh.
            var newActivity = {uid: $scope.uid, message: $scope.message, userID: $scope.userID, eventType: $scope.eventType, time: Firebase.ServerValue.TIMESTAMP, expiration: expiration};
            if($scope.description) newActivity.description = $scope.description;
            $scope.activities.add(newActivity);
            $scope.activityForm.$setPristine(); //Why doesn't this work?
        }
    }
]);