var app = angular.module('addActivity', ['firebase']);
var firebaseURL = 'https://sushain.firebaseio.com/';

app.controller('AddActivityController', ['$scope', '$timeout', 'angularFire', 'angularFireCollection', '$q',
    function($scope, $timeout, angularFire, angularFireCollection, $q) {
        $scope.eventType = 't1'; //Prevent Angular from adding a blank option
        $scope.activities = angularFireCollection(firebaseURL + 'activity');
        $scope.addActivity = function() {
            newActivity = {uid: $scope.uid, message: $scope.message, userID: $scope.userID, eventType: $scope.eventType, time: Firebase.ServerValue.TIMESTAMP};
            if($scope.description) newActivity.description = $scope.description;
            $scope.activities.add(newActivity);
            $scope.activityForm.$setPristine(); //Why doesn't this work?
        }
    }
]);