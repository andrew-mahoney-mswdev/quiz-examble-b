const firebase = require('firebase');
const functions = require('firebase-functions');

//Firebase configuration contains test project. To be updated with live probject.
const config = {
    apiKey: "AIzaSyDCrbKhwaY9Lbx1iCErFaNC44QL5FEr1Tk",
    authDomain: "quiz-example-b.firebaseapp.com",
    databaseURL: "https://quiz-example-b.firebaseio.com",
    projectId: "quiz-example-b",
        storageBucket: "quiz-example-b.appspot.com",
        messagingSenderId: "285015425210"
    };
    
firebase.initializeApp(config);
const database = firebase.database().ref();

//Allows an asyncronous function to be written in an syncronous way.
//A database reference and function are passed to here. The function is then run on the data snapshot.
function refDoSnap(ref, func) {
    database.child(ref).once("value")
        .then((snapshot) => {
            return func(snapshot);
        })
        .catch(error => {
            console.log(error);
            return error;
        });
}

//As above, but we run the function of the data value;
function refDoVal(ref, func) {
    database.child(ref).once("value")
        .then((snapshot) => {
            return func(snapshot.val());
        })
        .catch(error => {
            console.log(error);
            return error;
        });
}

//Sets the value of a reference in the database.
function setRef(ref, value) {
    database.child(ref).set(value)
        .catch(error => {
            console.log(error);
            return error;
        });
    return true;
}

//Copies one data reference to another.
function copyRef(from, to) {
    return refDoVal(from, value => setRef(to, value));
}

//Class manages updating of either the current question or debrief data in the database.
function UpdateCurrentRef(parentRef, quiz, number) {
    //parentRef - The value "question" or "debrief"
    //quiz - the quiz key
    //number - the question or debrief number
    var _from = "quizzes/" + quiz + "/";
    var _to = "current/" + parentRef + "/";

    setRef(_to + "number", number); //Sets the question number

    //Public function that moves data values from the source to the current reference
    this.move = function (ref) {
        copyRef(_from + "q" + number + "/" + ref, _to + ref);
    };
}

//Class records all relevant quiz data and contains functions that are used for the purpose of updating quiz data in the database.
//Most of these are single line functions that are only called once, and are therefore technically unnecessary.
//However, including them here makes the algorithm of exports.UpdateCurrent() easier to understand and modify.
//For detailed documentation, see exports.UpdateCurrent().
function QuizMngr() {
    //Variables that record data from the database
    var _sessionTimeout;
    var _questionTimeout;
    var _debriefTimeout;
    var _quizTime;
    var _quizKey;
    var _questionLength;
    var _debriefLength;
    var _quizzesSnap;
    var _sessionKey;
    var _currentAnswer = null; //Default setting confirms no answer has been set.
    var _timeElapsed; //The amount of time that has elapsed since the start of the quiz.
    var _now = Date.now();
   
    //Setters are called as as required when relevant data is loaded.
    this.setQuizzesSnap = function (quizzesSnap) {_quizzesSnap = quizzesSnap;}
    this.setSessionTimeout = function (sessionTimeout) {_sessionTimeout = sessionTimeout;}
    this.setQuestionTimeout = function (questionTimeout) {_questionTimeout = questionTimeout;}
    this.setDebriefTimeout = function (debriefTimeout) {_debriefTimeout = debriefTimeout;}
    this.setQuestionLength = function (questionLength) {_questionLength = questionLength;}
    this.setDebriefLength = function (debriefLength) {_debriefLength = debriefLength;}
    this.setSessionKey = function (sessionKey) {_sessionKey = sessionKey;}
    this.setCurrentAnswer = function (currentAnswer) {_currentAnswer = currentAnswer;}
    this.setQuizKey = function (quizKey) {_quizKey = quizKey;}
    this.setQuizTime = function (quizTime) {
        _quizTime = quizTime;
        _timeElapsed = _now - quizTime;
    }

    //The only Getters required, more can always be added.
    this.getNow = function () {return _now;}
    this.getQuizKey = function () {return _quizKey;}
    this.getSessionKey = function () {return _sessionKey;}

    //Boolean tests to determine the status of the quiz.
    this.hasQuizStarted = function () {return _now > _quizTime;}
    this.hasQuizEnded = function () {return _now > _sessionTimeout;}
    this.hasQuestionEnded = function () {return _now > _questionTimeout;}
    this.hasDebriefEnded = function () {return _now > _debriefTimeout;}
    this.hasFirstQuestionEnded = function () {return _timeElapsed > _questionLength;}

    //Functions for updating the current question.
    let _requiredQuestion;
    this.calculateCurrentQuestion = function () {_requiredQuestion = Math.floor(_timeElapsed / (_questionLength + _debriefLength));}
    this.loadCurrentQuestion = function () {
        let update = new UpdateCurrentRef("question", _quizKey, _requiredQuestion);
        update.move("text");
        for (index = 0; index < 4; index++)
            update.move("a" + index);
    }
    this.updateQuestionTimeout = function () {
        var questionTimeout = _quizTime + ((_questionLength + _debriefLength) * (_requiredQuestion + 1));
        setRef("active/questionTimeout", questionTimeout);
    }

    //Functions for updating the current debrief.
    let _requiredDebrief;
    this.calculateCurrentDebrief = function () {_requiredDebrief = Math.floor((_timeElapsed - _questionLength) / (_questionLength + _debriefLength));}
    this.loadCurrentDebrief = function () {
        let update = new UpdateCurrentRef("debrief", _quizKey, _requiredDebrief);
        update.move("correct");
        update.move("fact");
    }
    this.updateDebriefTimeout = function () {
        debriefTimeout = _quizTime + ((_questionLength + _debriefLength) * (_requiredDebrief + 1)) + _questionLength;
        setRef("active/debriefTimeout", debriefTimeout);
    }

    //Functions for loading a new quiz.
    let _nextQuizSnap = undefined;
    let _timeOfNextQuiz = new Date().setFullYear(2100);
    this.hasANextQuiz = function () {return _nextQuizSnap != undefined;}
    this.findNextQuiz = function () {
        _quizzesSnap.forEach( quizSnap => {
            var timeOfThisQuiz = quizSnap.child("time").val();
            if (timeOfThisQuiz > _quizTime && timeOfThisQuiz < _timeOfNextQuiz) { //We find the time of the next quiz.
                _timeOfNextQuiz = timeOfThisQuiz;
                _nextQuizSnap = quizSnap;
            }
        });
    }
    //General updates to quiz data.
    this.updateQuizKey = function () {setRef("active/quizKey", _nextQuizSnap.key);}
    this.updateQuizTime = function () {setRef("active/quizTime", _timeOfNextQuiz);}
    this.updateSessionTimeout = function () {copyRef("quizzes/" + _nextQuizSnap.key + "/sessionTimeout", "active/sessionTimeout");}
    this.updateSessionKey = function () {setRef("active/sessionKey", database.child("sessions").push( { "quizKey": _nextQuizSnap.key } ).key);}
    this.updateWithNoNextQuiz = function () { //Alternate function where no quiz is available.
        setRef("active/quizKey", "nil");
        setRef("active/quizTime", 0);
        setRef("active/sessionTimeout", 0);
        setRef("active/sessionKey", "nil");
    }

    //Functions for submitting answers, used by exports.submitAnswer()
    this.questionHasNoAnswer = function (userID, question) {
        if (_currentAnswer == null) return true; 
        else return false;
    }
    this.confirmQuestionIsCurrent = function (question) {
        this.calculateCurrentQuestion();
        this.calculateCurrentDebrief();
        return _requiredQuestion == question && _requiredDebrief != question;
    }
    this.setAnswer = function (userID, question, answer) {setRef("sessions/" + _sessionKey + "/a" + question + "/" + userID, answer);}

    this.toString = function () {
        var objData = "QuizMngr:- ";
        if (_now != undefined) {objData += "now: " + _now;}
        if (_sessionTimeout != undefined) {objData += ", sessionTimeout: " + _sessionTimeout;}
        if (_questionTimeout != undefined) {objData += ", questionTimeout: " + _questionTimeout;}
        if (_debriefTimeout != undefined) {objData += ", debriefTimeout: " + _debriefTimeout;}
        if (_quizTime != undefined) {objData += ", nextQuiz: " + _quizTime;}
        if (_quizKey != undefined) {objData += ", quizKey: " + _quizKey;}
        if (_questionLength != undefined) {objData += ", questionLength: " + _questionLength;}
        if (_debriefLength != undefined) {objData += ", debriefLength: " + _debriefLength;}
        if (_quizzesSnap != undefined) {objData += ", quizzesSnap: loaded";}
        if (_sessionKey != undefined) {objData += ", sessionKey: " + _sessionKey;}
        if (_currentAnswer != undefined) {objData += ", currentAnswer: " + _currentAnswer;}
        if (_timeElapsed != undefined) {objData += ", timeElapsed: " + _timeElapsed;}
        
        return objData;
    }
}

//This exported function is called by any client to update either the question, debrief or quiz data.
//Clients will request an update if they detect that this data is out of date.
//Function uses QuizMngr to check the status of the quiz against the current time to determine what updates are due.
//QuizMngr functions are used to perform those updates.
exports.updateCurrent = functions.https.onCall((data, context) => {
    
    var quizMngr;
    
    function callInvalid() {
        //While the client application will not call this function unnecessarily, it is possible that the time on a user's computer could be incorrect.
        //Also, user's could rewrite the client application to raise unnecessary function calls.
        //Where are a call is invalid, we log all relevant data for diagnosis.
        now = quizMngr.getNow();
        var error = "Invalid call to exports.updateCurrent() @ ";
        error += new Date(now).toString();
        error += ", from: unknown user";
        error += " :: ";
        error += quizMngr.toString();
        console.log(error);
    }
    
    refDoSnap("active", activeSnap => { //We get the active data key, and load relevant data values into the quizMngr.
        quizMngr = new QuizMngr();
        quizMngr.setSessionTimeout(activeSnap.child("sessionTimeout").val());
        quizMngr.setQuestionTimeout(activeSnap.child("questionTimeout").val());
        quizMngr.setDebriefTimeout(activeSnap.child("debriefTimeout").val());
        quizMngr.setQuizTime(activeSnap.child("quizTime").val());
        quizMngr.setQuizKey(activeSnap.child("quizKey").val());

        if (quizMngr.hasQuizStarted()) { //If the quiz has not started, we are waiting for the next quiz so no need to update.
            if (quizMngr.hasQuizEnded()) { //If the quiz has also ended, the next quiz must be loaded.
                refDoSnap("quizzes", quizzesSnap => { //We get the full list of quizzes, past and future.
                    quizMngr.setQuizzesSnap(quizzesSnap);

                    quizMngr.findNextQuiz(); //We find the next quiz that will run.

                    if (quizMngr.hasANextQuiz()) { //If there is a future quiz available, we load all relevant data about it.
                        quizMngr.updateQuizKey();
                        quizMngr.updateQuizTime();
                        quizMngr.updateSessionTimeout();
                        quizMngr.updateSessionKey();
                    }
                    else {
                        quizMngr.updateWithNoNextQuiz(); //Otherwise, we 0 out all relevant data values.
                    }

                });
            }

            else { //In this case, the quiz session is current.  We check for question and debrief updates.
                refDoVal("quizzes/" + quizMngr.getQuizKey() + "/questionLength", questionLength => { //We load relevant data about the question and debrief time lengths.
                refDoVal("quizzes/" + quizMngr.getQuizKey() + "/debriefLength", debriefLength => {
                    let validity = false; //This function call will be unnecessary if neither the question nor the debrief requires updating.

                    quizMngr.setQuestionLength(questionLength);
                    quizMngr.setDebriefLength(debriefLength);

                    if (quizMngr.hasQuestionEnded()) { //If question has ended, we figure out the next question and load relevant data.
                        validity = true;
                        quizMngr.calculateCurrentQuestion();
                        quizMngr.loadCurrentQuestion();
                        quizMngr.updateQuestionTimeout();
                    }

                    if (quizMngr.hasDebriefEnded() && quizMngr.hasFirstQuestionEnded()) { //Debrief is only relevant after the first question has ended.
                        validity = true;
                        quizMngr.calculateCurrentDebrief();
                        quizMngr.loadCurrentDebrief();
                        quizMngr.updateDebriefTimeout();
                    }

                    if (validity == false) callInvalid();
                }); 
                });
            }
        } else callInvalid();

    });
//Note: If this function is called after the quiz has started but before the quiz has loaded, it will load the quiz but not the first question.
//A second function call from the client will resolve this.
});

//This exported function is called when a client attempts to submit an answer.
exports.setAnswer = functions.https.onCall((data, context) => {
    var userID = data["userID"]; //userID - A unique ID of the user
    var question = data["question"]; //question - The question number being answered
    var answer = data["answer"]; //answer - The answer selected.

    var quizMngr;

    function callInvalid() {
        now = quizMngr.getNow();
        var error = "Invalid call to exports.setAnswer() @ ";
        error += new Date(now).toString();
        error += ", from: " + userID;
        error += " :: ";
        error += quizMngr.toString();
        console.log(error);
    }

    refDoSnap("active", activeSnap => { //We get several values from the active key,
        quizMngr = new QuizMngr();
        quizMngr.setQuizTime(activeSnap.child("quizTime").val());
        quizMngr.setSessionKey(activeSnap.child("sessionKey").val());
        quizMngr.setQuizKey(activeSnap.child("quizKey").val());
            
        refDoVal("quizzes/" + quizMngr.getQuizKey() + "/questionLength", questionLength => { //and the question and answer lengths.
        refDoVal("quizzes/" + quizMngr.getQuizKey() + "/debriefLength", debriefLength => {
        refDoVal("sessions/" + quizMngr.getSessionKey() + "/a" + question + "/" + userID, currentAnswer => {
            quizMngr.setQuestionLength(questionLength);
            quizMngr.setDebriefLength(debriefLength);
            quizMngr.setCurrentAnswer(currentAnswer);

            if (quizMngr.confirmQuestionIsCurrent(question) && quizMngr.questionHasNoAnswer())
                //If the question is current (i.e. the question has started and the debrief has not started)
                //and the user has not already submitted an answer
                quizMngr.setAnswer(userID, question, answer); //We save the user's answer.
            else
                callInvalid(); //Otherwise, the function call was unnecessary.

        });
        });
        });
    });

});
