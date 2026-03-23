// Firebase Configuration for Presentation Quiz System
// Replace the config below with your Firebase project config

const firebaseConfig = {
  apiKey: "AIzaSyDFeULv9ctfmmQjXwMnrOu-5EHgI8AjZbA",
  authDomain: "presentation-ac24c.firebaseapp.com",
  databaseURL: "https://presentation-ac24c-default-rtdb.firebaseio.com",
  projectId: "presentation-ac24c",
  storageBucket: "presentation-ac24c.firebasestorage.app",
  messagingSenderId: "976699222960",
  appId: "1:976699222960:web:ca38d3e0f2edfdbf838475"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Vote URL (GitHub Pages)
const VOTE_URL = 'https://kimi230.github.io/presentation/vote.html';

// DB References
const stateRef = db.ref('presentation/state');
const currentSlideRef = db.ref('presentation/state/currentSlide');
const activeQuizRef = db.ref('presentation/state/activeQuiz');
const votesRef = db.ref('presentation/votes');
const questionsRef = db.ref('presentation/questions');
const toolVotesRef = db.ref('presentation/toolVotes');

function quizVotesRef(quizId) {
  return db.ref('presentation/votes/' + quizId);
}
