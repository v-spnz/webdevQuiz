/* ─────────────────────────────────────────────
   COMP721 Quiz — script.js
   Loads questions from questions.json, runs the
   quiz, tracks answers, and shows a review.
───────────────────────────────────────────── */

// ── STATE ──────────────────────────────────
let allQuestions  = [];   // full bank loaded from JSON
let quizQuestions = [];   // questions for this session
let currentIndex  = 0;
let score         = 0;
let userAnswers   = [];   // { question, chosen, correct, isCorrect }
let quizMode      = 'all';

// ── ELEMENT REFS ───────────────────────────
const screens = {
  start:   document.getElementById('screen-start'),
  quiz:    document.getElementById('screen-quiz'),
  results: document.getElementById('screen-results'),
  review:  document.getElementById('screen-review')
};

// ── SHOW SCREEN ────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  screens[name].style.display = 'flex';
  // trigger animation by re-adding active after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => screens[name].classList.add('active'));
  });
  // scroll to top
  window.scrollTo(0, 0);
}

// ── LOAD QUESTIONS ─────────────────────────
async function loadQuestions() {
  const response = await fetch('questions.json');
  allQuestions = await response.json();
  document.getElementById('total-count').textContent =
    allQuestions.length + ' questions in the bank';
}

// ── MODE BUTTONS ───────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quizMode = btn.dataset.mode;
  });
});

// ── START ──────────────────────────────────
document.getElementById('btn-start').addEventListener('click', startQuiz);

function startQuiz() {
  if (quizMode === 'random') {
    // shuffle and take 15
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    quizQuestions = shuffled.slice(0, 15);
  } else {
    quizQuestions = [...allQuestions];
  }

  currentIndex = 0;
  score        = 0;
  userAnswers  = [];

  showScreen('quiz');
  renderQuestion();
}

// ── RENDER QUESTION ────────────────────────
function renderQuestion() {
  const q = quizQuestions[currentIndex];

  // progress
  const pct = ((currentIndex) / quizQuestions.length) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent =
    (currentIndex + 1) + ' / ' + quizQuestions.length;

  // week / topic tags
  document.getElementById('q-week').textContent  = 'Week ' + q.week;
  document.getElementById('q-topic').textContent = q.topic;

  // question number + text
  document.getElementById('q-number').textContent  = 'Question ' + (currentIndex + 1);
  document.getElementById('q-text').textContent    = q.question;

  // clear feedback and next button
  const feedback = document.getElementById('feedback');
  feedback.className = 'feedback';
  feedback.innerHTML = '';
  document.getElementById('btn-next').style.display = 'none';

  // render options
  const optionsList = document.getElementById('options-list');
  optionsList.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];

  q.options.forEach((optText, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML =
      '<span class="option-letter">' + letters[i] + '</span>' +
      '<span class="option-text">' + optText + '</span>';

    btn.addEventListener('click', () => handleAnswer(i));
    optionsList.appendChild(btn);
  });
}

// ── HANDLE ANSWER ──────────────────────────
function handleAnswer(chosenIndex) {
  const q       = quizQuestions[currentIndex];
  const correct = q.answer;
  const isRight = chosenIndex === correct;

  if (isRight) score++;

  // record answer
  userAnswers.push({
    question:  q,
    chosen:    chosenIndex,
    correct:   correct,
    isCorrect: isRight
  });

  // disable all buttons, colour them
  const btns = document.querySelectorAll('.option-btn');
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct)  btn.classList.add('correct');
    if (i === chosenIndex && !isRight) btn.classList.add('wrong');
  });

  // show feedback
  const feedback = document.getElementById('feedback');
  feedback.classList.add('visible');
  if (isRight) {
    feedback.classList.add('correct-fb');
    feedback.innerHTML =
      '<span class="feedback-label">✓ Correct!</span>' + q.explanation;
  } else {
    feedback.classList.add('wrong-fb');
    feedback.innerHTML =
      '<span class="feedback-label">✗ Incorrect</span>' + q.explanation;
  }

  // show next button
  const btnNext = document.getElementById('btn-next');
  btnNext.style.display = 'block';
  btnNext.textContent = currentIndex < quizQuestions.length - 1
    ? 'Next Question →'
    : 'See Results →';
}

// ── NEXT ───────────────────────────────────
document.getElementById('btn-next').addEventListener('click', () => {
  currentIndex++;
  if (currentIndex < quizQuestions.length) {
    renderQuestion();
    // scroll question card to top on mobile
    document.getElementById('question-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    showResults();
  }
});

// ── RESULTS ────────────────────────────────
function showResults() {
  // update progress to 100%
  document.getElementById('progress-fill').style.width = '100%';

  showScreen('results');

  const total  = quizQuestions.length;
  const pct    = Math.round((score / total) * 100);

  // score circle
  const circle = document.getElementById('score-circle');
  document.getElementById('score-num').textContent   = score;
  document.getElementById('score-denom').textContent = '/ ' + total;
  circle.className = 'score-circle';
  if (pct >= 75) circle.classList.add('great');
  else if (pct >= 50) circle.classList.add('ok');
  else circle.classList.add('poor');

  // heading + message
  let heading, msg;
  if (pct >= 85) {
    heading = 'Excellent work! 🎉';
    msg = "You've got this material down. Review any you missed and you'll be ready.";
  } else if (pct >= 65) {
    heading = 'Good effort! 👍';
    msg = "Solid score — go back over the topics you dropped and you'll be in good shape.";
  } else if (pct >= 50) {
    heading = 'Getting there...';
    msg = "Review the explanations for the questions you missed — focus on PHP superglobals and AJAX.";
  } else {
    heading = 'More study needed 📚';
    msg = "Go back through the lecture slides, then retry. Use the Answer Review to find your weak spots.";
  }
  document.getElementById('results-heading').textContent = heading;
  document.getElementById('results-msg').textContent     = msg;

  // per-topic breakdown
  const topicMap = {};
  userAnswers.forEach(a => {
    const t = a.question.topic;
    if (!topicMap[t]) topicMap[t] = { correct: 0, total: 0 };
    topicMap[t].total++;
    if (a.isCorrect) topicMap[t].correct++;
  });

  const breakdown = document.getElementById('breakdown');
  breakdown.innerHTML = '';
  Object.entries(topicMap).forEach(([topic, data]) => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';

    const topicPct = Math.round((data.correct / data.total) * 100);
    let scoreClass = 'poor';
    if (topicPct >= 75) scoreClass = 'perfect';
    else if (topicPct >= 50) scoreClass = 'partial';

    row.innerHTML =
      '<span class="breakdown-topic">' + topic + '</span>' +
      '<span class="breakdown-score ' + scoreClass + '">' +
      data.correct + '/' + data.total + '</span>';
    breakdown.appendChild(row);
  });
}

// ── REVIEW ─────────────────────────────────
document.getElementById('btn-review').addEventListener('click', () => {
  buildReview();
  showScreen('review');
});

document.getElementById('btn-back-results').addEventListener('click', () => {
  showScreen('results');
});

function buildReview() {
  const list = document.getElementById('review-list');
  list.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];

  userAnswers.forEach((a, i) => {
    const q   = a.question;
    const div = document.createElement('div');
    div.className = 'review-item ' + (a.isCorrect ? 'correct-item' : 'wrong-item');

    const yourText    = q.options[a.chosen];
    const correctText = q.options[a.correct];

    let yourAnswerHTML = '';
    if (a.isCorrect) {
      yourAnswerHTML =
        '<div class="review-answer your-answer correct">✓ You answered: ' +
        letters[a.chosen] + '. ' + yourText + '</div>';
    } else {
      yourAnswerHTML =
        '<div class="review-answer your-answer wrong">✗ You answered: ' +
        letters[a.chosen] + '. ' + yourText + '</div>' +
        '<div class="review-answer correct-answer">✓ Correct answer: ' +
        letters[a.correct] + '. ' + correctText + '</div>';
    }

    div.innerHTML =
      '<div class="review-meta">' +
        '<span class="week-tag">Week ' + q.week + '</span>' +
        '<span class="topic-tag">' + q.topic + '</span>' +
      '</div>' +
      '<p class="question-text">Q' + (i+1) + '. ' + q.question + '</p>' +
      yourAnswerHTML +
      '<p class="review-explanation">' + q.explanation + '</p>';

    list.appendChild(div);
  });
}

// ── RESTART ────────────────────────────────
document.getElementById('btn-restart').addEventListener('click', () => {
  showScreen('start');
});

// ── INIT ───────────────────────────────────
(async function init() {
  showScreen('start');
  await loadQuestions();
})();
