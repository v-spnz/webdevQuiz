/* ══════════════════════════════════════════════════════
   COMP721 Quiz Prep — script.js
   Features: topic filter, shuffle, timer (exam-accurate),
   prev/next navigation, bookmarks, streak, question dots,
   keyboard shortcuts, score history, weak topics stats.
══════════════════════════════════════════════════════ */

// ── CONSTANTS ───────────────────────────────────────
const EXAM_SECS      = 40 * 60;  // 40 minutes (as per lecturer)
const EXAM_QS        = 15;       // questions in the real quiz
const MAX_HISTORY    = 10;
const STORAGE_KEY    = 'comp721_history';

// Escape HTML so option text like <php> or <?php doesn't vanish when
// inserted via innerHTML — replaces <, >, &, etc. with safe entities
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ── ANSWER CORRECTNESS HELPER ────────────────────────────────
function isAnswerCorrect(q, a) {
  if (a === null || a === undefined) return false;
  if (q.type === 'fillin')      return a === '__correct__';
  if (q.type === 'multianswer') {
    if (!Array.isArray(a)) return false;
    const sel = [...a].sort((x,y) => x-y);
    const cor = [...q.answers].sort((x,y) => x-y);
    return sel.length === cor.length && sel.every((v,i) => v === cor[i]);
  }
  return a === q.answer;
}

// ── RENDER MULTI-ANSWER ──────────────────────────────────────
function renderMultiAnswer(q, chosen, isAnswered, container) {
  const letters    = ['A','B','C','D','E'];
  const selected   = isAnswered ? (Array.isArray(chosen) ? chosen : []) : [];
  const correctSet = new Set(q.answers);

  const hint = document.createElement('p');
  hint.className   = 'ma-hint';
  hint.textContent = '☑ Select all that apply, then click Submit';
  container.appendChild(hint);

  const optList = document.createElement('div');
  optList.className = 'options-list';

  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className  = 'option-btn ma-btn';
    btn.dataset.index = i;
    btn.innerHTML  =
      '<span class="option-letter ma-check" data-idx="' + i + '">□</span>' +
      '<span class="option-text">' + escapeHtml(opt) + '</span>';

    if (isAnswered) {
      btn.disabled = true;
      const wasPicked = selected.includes(i);
      const correct   = correctSet.has(i);
      if (correct)              btn.classList.add('correct');
      if (wasPicked && !correct) btn.classList.add('wrong');
      if (!correct && !wasPicked) btn.classList.add('faded');
      btn.querySelector('.ma-check').textContent =
        wasPicked ? (correct ? '☑' : '☒') : (correct ? '☑' : '□');
    } else {
      btn.addEventListener('click', () => toggleMultiAnswer(i, btn, submitBtn));
    }
    optList.appendChild(btn);
  });
  container.appendChild(optList);

  const submitBtn = document.createElement('button');
  submitBtn.className   = 'fillin-submit ma-submit';
  submitBtn.textContent = 'SUBMIT';
  submitBtn.id          = 'ma-submit';
  submitBtn.disabled    = true;
  if (!isAnswered) container.appendChild(submitBtn);
  submitBtn.addEventListener('click', () => handleMultiAnswer(q));
}

let maSelected = new Set();

function toggleMultiAnswer(idx, btn, submitBtn) {
  if (maSelected.has(idx)) {
    maSelected.delete(idx);
    btn.classList.remove('ma-selected');
    btn.querySelector('.ma-check').textContent = '□';
  } else {
    maSelected.add(idx);
    btn.classList.add('ma-selected');
    btn.querySelector('.ma-check').textContent = '☑';
  }
  submitBtn.disabled = maSelected.size === 0;
}

function handleMultiAnswer(q) {
  if (answers[currentIndex] !== null) return;
  const sel = [...maSelected].sort((a,b) => a-b);
  answers[currentIndex] = sel;
  maSelected = new Set();
  const ok = isAnswerCorrect(q, sel);
  if (ok) { streak++; if (streak > maxStreak) maxStreak = streak; } else streak = 0;
  updateStreakBadge();
  renderQuestion();
}



// ── STATE ────────────────────────────────────────────
let allQuestions  = [];   // raw from JSON
let quizQuestions = [];   // prepared (shuffled options) for this session
let currentIndex  = 0;
let answers       = [];   // answers[i] = chosen index, or null if unanswered
let bookmarks     = new Set();  // indices of bookmarked questions
let streak        = 0;
let maxStreak     = 0;

// settings (read from UI when starting)
let quizMode      = 'all';   // 'all' | 'random'
let timerEnabled  = false;
let shuffleEnabled = true;
let activeWeeks   = new Set(['1', '2', '3', '4', 'Control Structures', '5', 'Real Quiz']);

// timer
let timerInterval = null;
let timeLeft      = 0;

// review filter
let reviewFilter  = 'all';

// ── SCREEN MAP ───────────────────────────────────────
const screens = {
  start:   document.getElementById('screen-start'),
  quiz:    document.getElementById('screen-quiz'),
  results: document.getElementById('screen-results'),
  review:  document.getElementById('screen-review'),
  stats:   document.getElementById('screen-stats'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  screens[name].style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => screens[name].classList.add('active')));
  window.scrollTo(0, 0);
}

// ── CONFIRM DIALOG ───────────────────────────────────
function showConfirm(heading, msg, label, onConfirm) {
  document.getElementById('confirm-overlay')?.remove();
  const el = document.createElement('div');
  el.className = 'confirm-overlay'; el.id = 'confirm-overlay';
  el.innerHTML =
    '<div class="confirm-box">' +
      '<h3>' + heading + '</h3><p>' + msg + '</p>' +
      '<div class="confirm-actions">' +
        '<button class="btn-danger" id="c-yes">' + label + '</button>' +
        '<button class="btn-cancel" id="c-no">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);
  document.getElementById('c-yes').onclick = () => { el.remove(); onConfirm(); };
  document.getElementById('c-no').onclick  = () => el.remove();
  el.onclick = e => { if (e.target === el) el.remove(); };
}

// ── LOAD QUESTIONS ───────────────────────────────────
async function loadQuestions() {
  const res = await fetch('questions.json');
  allQuestions = await res.json();
  updateStartCount();
}

// Shuffle array in-place (Fisher-Yates)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Prepare a question — optionally shuffle its option order
// Skip shuffling for fill-in-the-blank (no options) and true/false (order matters)
function prepareQuestion(q) {
  if (!shuffleEnabled || q.type === 'fillin' || q.type === 'truefalse') return { ...q };
  if (!q.options || q.options.length === 0) return { ...q };
  if (q.type === 'multianswer') {
    const len = q.options.length;
    const idx = shuffle([...Array(len).keys()]);
    return { ...q, options: idx.map(i => q.options[i]), answers: q.answers.map(a => idx.indexOf(a)) };
  }
  const n   = Math.min(q.options.length, 4);
  const idx = shuffle([...Array(n).keys()]);
  return { ...q, options: idx.map(i => q.options[i]), answer: idx.indexOf(q.answer) };
}

// ── START SCREEN SETUP ───────────────────────────────

// Week filter pills
document.querySelectorAll('.week-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    pill.classList.toggle('active');
    const w = pill.dataset.week;
    activeWeeks.has(w) ? activeWeeks.delete(w) : activeWeeks.add(w);
    // Ensure at least one week is always active
    if (activeWeeks.size === 0) {
      activeWeeks.add(w);
      pill.classList.add('active');
    }
    updateStartCount();
  });
});

// Mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    quizMode = btn.dataset.mode;
    updateTimerSub();
    updateStartCount();
  });
});

// Timer toggle
document.getElementById('timer-toggle').addEventListener('change', e => {
  timerEnabled = e.target.checked;
  updateTimerSub();
});

// Shuffle toggle
document.getElementById('shuffle-toggle').addEventListener('change', e => {
  shuffleEnabled = e.target.checked;
});

function updateTimerSub() {
  const filteredCount = allQuestions.filter(q => activeWeeks.has(String(q.week))).length;
  const n = quizMode === 'random' ? Math.min(15, filteredCount) : filteredCount;
  const mins = Math.round(EXAM_SECS / EXAM_QS * n / 60);
  const sub = document.getElementById('timer-sub');
  if (quizMode === 'random' && n === 15) {
    sub.textContent = '40 min for 15 questions — exact exam simulation';
  } else {
    sub.textContent = '~' + mins + ' min for ' + n + ' questions (scaled from 40 min / 15 q)';
  }
}

function updateStartCount() {
  const filtered = allQuestions.filter(q => activeWeeks.has(String(q.week)));
  const n = quizMode === 'random' ? Math.min(15, filtered.length) : filtered.length;
  document.getElementById('total-count').textContent = n + ' questions selected';
  updateTimerSub();
}

// ── START QUIZ ───────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', startQuiz);

function startQuiz() {
  // Filter by active weeks
  const pool = allQuestions.filter(q => activeWeeks.has(String(q.week)));
  if (pool.length === 0) { alert('Please select at least one topic.'); return; }

  let picked = quizMode === 'random'
    ? shuffle([...pool]).slice(0, EXAM_QS)
    : [...pool];

  quizQuestions = picked.map(prepareQuestion);
  answers       = new Array(quizQuestions.length).fill(null);
  bookmarks     = new Set();
  maSelected    = new Set();
  currentIndex  = 0;
  streak        = 0;
  maxStreak     = 0;

  showScreen('quiz');
  renderQuestion();

  // Timer
  stopTimer();
  if (timerEnabled) startTimer();
  document.getElementById('timer-display').style.display = timerEnabled ? 'block' : 'none';
  document.getElementById('streak-badge').style.display = 'none';
}

// ── TIMER ────────────────────────────────────────────
function startTimer() {
  timeLeft = Math.round(EXAM_SECS / EXAM_QS * quizQuestions.length);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      stopTimer();
      finishQuiz(true); // true = time expired
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay() {
  const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const s = String(timeLeft % 60).padStart(2, '0');
  const el = document.getElementById('timer-display');
  el.textContent = m + ':' + s;
  el.className = 'timer-display';
  if (timeLeft <= 60)  el.classList.add('critical');
  else if (timeLeft <= 300) el.classList.add('urgent');
}

// ── HOME / RESET ─────────────────────────────────────
document.getElementById('btn-home').addEventListener('click', () => {
  showConfirm('Back to Home?', 'Your quiz progress will be lost.', 'Yes, go home', () => {
    stopTimer();
    showScreen('start');
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  showConfirm('Reset Quiz?', 'Restart from Q1 with the same questions.', 'Reset', () => {
    stopTimer();
    answers      = new Array(quizQuestions.length).fill(null);
    bookmarks    = new Set();
    currentIndex = 0;
    streak       = 0;
    maxStreak    = 0;
    if (timerEnabled) startTimer();
    document.getElementById('timer-display').style.display = timerEnabled ? 'block' : 'none';
    document.getElementById('streak-badge').style.display = 'none';
    renderQuestion();
  });
});

// ── RENDER QUESTION ──────────────────────────────────
function renderQuestion() {
  const q          = quizQuestions[currentIndex];
  const chosen     = answers[currentIndex]; // null = unanswered
  const isAnswered = chosen !== null;
  const qType      = q.type || 'mcq'; // default to mcq for backwards compat
  if (qType === 'multianswer' && !isAnswered) maSelected = new Set();

  // Tags + week colour
  const weekColors = { '1': '#4f8ef7', '2': '#3ecf8e', '3': '#a78bfa', 'Control Structures': '#f7c44f', '4': '#fb923c', '5': '#f76f6f', 'Real Quiz': '#fbbf24' };
  const wColor = weekColors[String(q.week)] || '#4f8ef7';
  document.getElementById('question-card').style.setProperty('--week-color', wColor);
  document.querySelector('.quiz-header').style.setProperty('--week-color', wColor);
  document.getElementById('q-week').textContent  = 'Week ' + q.week;
  document.getElementById('q-topic').textContent = q.topic;

  // Type badge on question number
  const typeBadge = qType === 'truefalse' ? ' · T/F' : qType === 'fillin' ? ' · Fill in' : qType === 'multianswer' ? ' · Select all' : '';
  document.getElementById('q-number').textContent = 'Question ' + (currentIndex + 1) + ' of ' + quizQuestions.length + typeBadge;

  // For fill-in: split on ___ and inject inline input or answered span
  const qTextEl = document.getElementById('q-text');
  if (qType === 'fillin') {
    const parts = q.question.split(/_{2,}/);
    const before = escapeHtml(parts[0] || '');
    const after  = escapeHtml(parts[1] || '');
    if (!isAnswered) {
      qTextEl.innerHTML = before +
        '<input class="fillin-inline-input" id="fillin-inline-input" type="text" ' +
        'placeholder="your answer…" autocomplete="off" spellcheck="false">' +
        after;
    } else {
      const gotItRight = chosen === '__correct__';
      const val = escapeHtml(gotItRight ? q.answers[0] : chosen);
      const cls = gotItRight ? 'fillin-inline-correct' : 'fillin-inline-wrong';
      qTextEl.innerHTML = before +
        '<span class="fillin-inline-val ' + cls + '">' + val + '</span>' +
        after;
    }
  } else {
    qTextEl.textContent = q.question;
  }

  // Bookmark button
  const bmBtn = document.getElementById('btn-bookmark');
  bmBtn.textContent = bookmarks.has(currentIndex) ? '★' : '☆';
  bmBtn.className   = 'btn-bookmark' + (bookmarks.has(currentIndex) ? ' bookmarked' : '');

  // Progress bar
  const answeredCount = answers.filter(a => a !== null).length;
  document.getElementById('progress-fill').style.width = (answeredCount / quizQuestions.length * 100) + '%';
  document.getElementById('progress-text').textContent = (currentIndex + 1) + ' / ' + quizQuestions.length;

  // ── Render input area based on type ──
  const list = document.getElementById('options-list');
  list.innerHTML = '';

  if (qType === 'fillin') {
    renderFillIn(q, chosen, isAnswered, list);
  } else if (qType === 'multianswer') {
    renderMultiAnswer(q, chosen, isAnswered, list);
  } else {
    // mcq and truefalse both use option buttons
    const letters = qType === 'truefalse' ? ['', ''] : ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn' + (qType === 'truefalse' ? ' tf-btn' : '');
      btn.dataset.index = i;

      if (qType === 'truefalse') {
        const icon = opt === 'True' ? '✓' : '✗';
        const cls  = opt === 'True' ? 'tf-true' : 'tf-false';
        btn.innerHTML = '<span class="tf-icon ' + cls + '">' + icon + '</span><span class="option-text">' + escapeHtml(opt) + '</span>';
      } else {
        btn.innerHTML =
          '<span class="option-letter">' + letters[i] + '</span>' +
          '<span class="option-text">'   + escapeHtml(opt) + '</span>';
      }

      if (isAnswered) {
        btn.disabled = true;
        if (i === q.answer)                      btn.classList.add('correct');
        if (i === chosen && chosen !== q.answer) btn.classList.add('wrong');
      } else {
        btn.addEventListener('click', () => handleAnswer(i));
      }
      list.appendChild(btn);
    });
  }

  // ── Feedback ──
  const fb = document.getElementById('feedback');
  fb.className = 'feedback';
  fb.innerHTML = '';
  if (isAnswered) {
    const gotItRight = isAnswerCorrect(q, chosen);

    fb.classList.add('visible', gotItRight ? 'correct-fb' : 'wrong-fb');
    const label   = gotItRight ? '✓ Correct!' : '✗ Incorrect';
    const hasDumb = q.simple_explanation && q.simple_explanation.trim() !== '';

    let wrongHint = '';
    if (!gotItRight && qType === 'fillin') {
      wrongHint = '<div class="fillin-correct-hint">Correct answer: <strong>' + escapeHtml(q.answers[0]) + '</strong></div>';
    } else if (!gotItRight && qType === 'multianswer') {
      const L = ['A','B','C','D','E'];
      const cl = q.answers.map(idx => L[idx] + '. ' + escapeHtml(q.options[idx])).join(', ');
      wrongHint = '<div class="fillin-correct-hint">Correct answers: <strong>' + cl + '</strong></div>';
    }

    fb.innerHTML =
      '<span class="feedback-label">' + label + '</span>' +
      wrongHint +
      '<span class="fb-explanation" id="fb-explanation">' + q.explanation + '</span>' +
      (hasDumb
        ? '<button class="btn-dumb" id="btn-dumb" data-mode="normal">💡 Explain simply</button>' +
          '<span class="fb-simple" id="fb-simple" style="display:none">' + q.simple_explanation + '</span>'
        : '');

    const dumbBtn = document.getElementById('btn-dumb');
    if (dumbBtn) {
      dumbBtn.addEventListener('click', () => {
        const expl  = document.getElementById('fb-explanation');
        const simp  = document.getElementById('fb-simple');
        const isNormal = dumbBtn.dataset.mode === 'normal';
        expl.style.display  = isNormal ? 'none'  : 'block';
        simp.style.display  = isNormal ? 'block' : 'none';
        dumbBtn.textContent = isNormal ? '📖 Show original' : '💡 Explain simply';
        dumbBtn.dataset.mode = isNormal ? 'simple' : 'normal';
      });
    }
  }

  // Nav buttons
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  prevBtn.disabled = currentIndex === 0;

  if (isAnswered) {
    nextBtn.style.display = 'block';
    nextBtn.textContent   = currentIndex < quizQuestions.length - 1 ? 'Next →' : 'See Results →';
  } else {
    nextBtn.style.display = 'none';
  }

  renderDots();
}

// ── RENDER FILL-IN INPUT ─────────────────────────────
function renderFillIn(q, chosen, isAnswered, container) {
  if (isAnswered) return; // answered state is shown inline in the question text

  const submitBtn = document.createElement('button');
  submitBtn.className   = 'fillin-submit';
  submitBtn.textContent = 'SUBMIT';
  submitBtn.id          = 'fillin-submit';
  submitBtn.disabled    = true;
  container.appendChild(submitBtn);

  // Input lives inline in q-text — wire it up now that it's in the DOM
  const input = document.getElementById('fillin-inline-input');

  const doSubmit = () => {
    const val = input ? input.value.trim() : '';
    if (!val) { input?.focus(); return; }
    handleFillIn(val, q);
  };

  if (input) {
    input.addEventListener('input', () => {
      submitBtn.disabled = input.value.trim().length === 0;
    });
    input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !submitBtn.disabled) {
    e.preventDefault();
    e.stopPropagation(); // stop the global Enter shortcut from firing too
    doSubmit();
  }
});
    setTimeout(() => input.focus(), 50);
  }

  submitBtn.addEventListener('click', doSubmit);
}

// ── STREAK BADGE ─────────────────────────────────────
function updateStreakBadge() {
  const badge = document.getElementById('streak-badge');
  if (streak >= 2) {
    badge.style.display = 'block';
    badge.style.opacity = '1';
    document.getElementById('streak-num').textContent = streak;
  } else {
    badge.style.transition = 'opacity .4s ease';
    badge.style.opacity = '0';
    setTimeout(() => { badge.style.display = 'none'; badge.style.transition = ''; }, 400);
  }
}

// ── HANDLE MCQ / TRUE-FALSE ANSWER ───────────────────
function handleAnswer(chosenIndex) {
  if (answers[currentIndex] !== null) return;
  const q = quizQuestions[currentIndex];
  answers[currentIndex] = chosenIndex;

  const isCorrect = chosenIndex === q.answer;
  if (isCorrect) {
    streak++;
    if (streak > maxStreak) maxStreak = streak;
  } else {
    streak = 0;
  }

  updateStreakBadge();

  // Fade all options that are neither correct nor the chosen wrong one
  const allBtns = document.querySelectorAll('.option-btn');
  allBtns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) {
      btn.classList.add('correct');
    } else if (i === chosenIndex) {
      btn.classList.add('wrong');
    } else {
      btn.classList.add('faded');
    }
  });

  renderQuestion();
}

// ── HANDLE FILL-IN ANSWER ────────────────────────────
function handleFillIn(typed, q) {
  if (answers[currentIndex] !== null) return;

  const normalise = s => s.trim().toLowerCase().replace(/[^a-z0-9_$*%.]/g, '');
  const isCorrect = q.answers.some(a => normalise(typed) === normalise(a));

  // Store '__correct__' for correct answers so we can still show q.answers[0]
  answers[currentIndex] = isCorrect ? '__correct__' : typed;

  if (isCorrect) {
    streak++;
    if (streak > maxStreak) maxStreak = streak;
  } else {
    streak = 0;
  }

  updateStreakBadge();

  renderQuestion();
}

// ── NAVIGATION ───────────────────────────────────────
document.getElementById('btn-prev').addEventListener('click', () => {
  if (currentIndex > 0) { currentIndex--; renderQuestion(); scrollCardTop(); }
});

document.getElementById('btn-next').addEventListener('click', goNext);

function goNext() {
  if (answers[currentIndex] === null) return;
  if (currentIndex < quizQuestions.length - 1) {
    currentIndex++;
    renderQuestion();
    scrollCardTop();
  } else {
    finishQuiz(false);
  }
}

function scrollCardTop() {
  document.getElementById('question-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── DOTS ─────────────────────────────────────────────
function renderDots() {
  const strip = document.getElementById('dots-strip');
  strip.innerHTML = '';
  quizQuestions.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'dot';
    if (i === currentIndex) d.classList.add('dot-current');
    else if (answers[i] !== null) {
      d.classList.add(isAnswerCorrect(q, answers[i]) ? 'dot-correct' : 'dot-wrong');
    }
    if (bookmarks.has(i)) d.classList.add('dot-bookmarked');
    strip.appendChild(d);
  });

  // Only scroll if dots overflow the wrap — otherwise text-align:center handles it
  requestAnimationFrame(() => {
    const wrap = strip.parentElement;
    const currentDot = strip.children[currentIndex];
    if (!currentDot || strip.scrollWidth <= wrap.clientWidth) return;
    const dotCenter = currentDot.offsetLeft + currentDot.offsetWidth / 2;
    wrap.scrollTo({ left: Math.max(0, dotCenter - wrap.clientWidth / 2), behavior: 'smooth' });
  });
}

// ── BOOKMARK ─────────────────────────────────────────
document.getElementById('btn-bookmark').addEventListener('click', () => toggleBookmark(currentIndex));

function toggleBookmark(idx) {
  bookmarks.has(idx) ? bookmarks.delete(idx) : bookmarks.add(idx);
  renderQuestion();
}

// ── KEYBOARD SHORTCUTS ───────────────────────────────
document.addEventListener('keydown', e => {
  // 🚫 Disable shortcuts when typing in ANY input/textarea/contenteditable
const active = document.activeElement;
if (
  active &&
  (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.isContentEditable
  )
) {
  return; // let typing behave normally (fixes F + space)
}
  if (!screens.quiz.classList.contains('active')) return;
  // Don't intercept keypresses when the fill-in input is focused
  if (document.activeElement && document.activeElement.id === 'fillin-input') return;

  const isAnswered = answers[currentIndex] !== null;
  if ((quizQuestions[currentIndex]?.type || 'mcq') === 'multianswer') return;
  const optBtns = document.querySelectorAll('.option-btn');
  const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };

  if (!isAnswered && keyMap[e.key] !== undefined) {
    const idx = keyMap[e.key];
    if (idx < quizQuestions[currentIndex].options.length) {
      // Flash effect
      optBtns[idx]?.classList.add('flash');
      setTimeout(() => optBtns[idx]?.classList.remove('flash'), 200);
      handleAnswer(idx);
    }
    return;
  }

  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (isAnswered) goNext();
      break;
    case 'ArrowLeft':
      if (currentIndex > 0) { currentIndex--; renderQuestion(); scrollCardTop(); }
      break;
    case 'ArrowRight':
      if (isAnswered) goNext();
      break;
    case 'f':
    case 'F':
      toggleBookmark(currentIndex);
      break;
  }
});

// ── FINISH QUIZ ──────────────────────────────────────
function finishQuiz(timedOut) {
  stopTimer();
  saveSession();
  showResults(timedOut);
}

// ── RESULTS ──────────────────────────────────────────
function showResults(timedOut = false) {
  showScreen('results');

  const total   = quizQuestions.length;
  const score   = answers.filter((a, i) => {
    if (a === null) return false;
    const q = quizQuestions[i];
    return isAnswerCorrect(q, a);
  }).length;
  const pct     = Math.round(score / total * 100);

  // Score circle
  const circle = document.getElementById('score-circle');
  document.getElementById('score-num').textContent   = score;
  document.getElementById('score-denom').textContent = '/ ' + total;
  circle.className = 'score-circle ' + (pct >= 75 ? 'great' : pct >= 50 ? 'ok' : 'poor');

  // Heading + message
  let heading, msg;
  if (timedOut) {
    heading = "Time's up! ⏱";
    msg = 'The 40-minute exam timer ran out. See how you did — and focus on the topics in red below.';
  } else if (pct >= 85) {
    heading = 'Excellent work! 🎉';
    msg = "Outstanding — you clearly know this content. Review any you missed and you'll walk into that quiz confident.";
  } else if (pct >= 65) {
    heading = 'Good effort! 👍';
    msg = "Solid score — go back over the topics marked red below and you'll be in great shape.";
  } else if (pct >= 50) {
    heading = 'Getting there...';
    msg = "You're on track, but the topics in red need more attention before Week 7.";
  } else {
    heading = 'More study needed 📚';
    msg = "Go back through your lecture slides, then retry. Use Answer Review to find your weak spots.";
  }
  document.getElementById('results-heading').textContent = heading;
  document.getElementById('results-msg').textContent     = msg;

  // Highlight pills
  const pillsEl = document.getElementById('result-pills');
  pillsEl.innerHTML = '';
  if (maxStreak >= 3) addPill(pillsEl, '🔥 Best streak: ' + maxStreak, 'streak');
  if (timerEnabled && !timedOut) addPill(pillsEl, '⏱ Finished in time', 'timer');
  if (timedOut) addPill(pillsEl, '⏱ Timed out', 'mode');
  addPill(pillsEl, quizMode === 'random' ? 'Random 15' : 'All Questions', 'mode');
  if (shuffleEnabled) addPill(pillsEl, '🔀 Shuffled', 'mode');

  // Topic breakdown
  const topicMap = {};
  quizQuestions.forEach((q, i) => {
    const t = q.topic;
    if (!topicMap[t]) topicMap[t] = { correct: 0, total: 0 };
    topicMap[t].total++;
    if (isAnswerCorrect(q, answers[i])) topicMap[t].correct++;
  });

  const bd = document.getElementById('breakdown');
  bd.innerHTML = '';
  Object.entries(topicMap).forEach(([topic, d]) => {
    const p = Math.round(d.correct / d.total * 100);
    const cls = p >= 75 ? 'perfect' : p >= 50 ? 'partial' : 'poor';
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML =
      '<span class="breakdown-topic">' + topic + '</span>' +
      '<span class="breakdown-score ' + cls + '">' + d.correct + '/' + d.total + '</span>';
    bd.appendChild(row);
  });

  // Bookmarked section
  const bkSection = document.getElementById('bookmarked-section');
  const bkList    = document.getElementById('bookmarked-list');
  bkList.innerHTML = '';
  if (bookmarks.size > 0) {
    bkSection.style.display = 'block';
    bookmarks.forEach(i => {
      const div = document.createElement('div');
      div.className = 'bookmarked-item';
      div.textContent = 'Q' + (i + 1) + ': ' + quizQuestions[i].question.slice(0, 80) + (quizQuestions[i].question.length > 80 ? '…' : '');
      bkList.appendChild(div);
    });
  } else {
    bkSection.style.display = 'none';
  }
}

function addPill(container, text, type) {
  const p = document.createElement('div');
  p.className = 'result-pill ' + type;
  p.textContent = text;
  container.appendChild(p);
}

// ── RESULTS BUTTONS ──────────────────────────────────
document.getElementById('btn-review').addEventListener('click', () => {
  reviewFilter = 'all';
  buildReview();
  showScreen('review');
});

document.getElementById('btn-restart').addEventListener('click', () => showScreen('start'));
document.getElementById('btn-home-results').addEventListener('click', () => showScreen('start'));
document.getElementById('btn-back-results').addEventListener('click', () => showScreen('results'));

// ── REVIEW ───────────────────────────────────────────
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    reviewFilter = tab.dataset.filter;
    buildReview();
  });
});

function buildReview() {
  const list    = document.getElementById('review-list');
  const letters = ['A', 'B', 'C', 'D'];
  list.innerHTML = '';

  const items = quizQuestions.map((q, i) => ({
    q, i,
    chosen:    answers[i],
    isCorrect: answers[i] !== null && isAnswerCorrect(q, answers[i])
  }));

  const filtered = items.filter(({ i, isCorrect, chosen }) => {
    if (reviewFilter === 'wrong')       return !isCorrect;
    if (reviewFilter === 'bookmarked')  return bookmarks.has(i);
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="no-results-msg">No questions match this filter.</p>';
    return;
  }

  filtered.forEach(({ q, i, chosen, isCorrect }) => {
    const div = document.createElement('div');
    div.className = 'review-item ' + (isCorrect ? 'correct-item' : 'wrong-item');

    const revLetters = ['A','B','C','D','E'];
    let answerHTML = '';
    if (chosen === null) {
      answerHTML = '<div class="review-answer unanswered">— Not answered (timer ran out)</div>';
    } else if (q.type === 'multianswer') {
      const sel = Array.isArray(chosen) ? chosen : [];
      const yourList = sel.length > 0 ? sel.map(idx => revLetters[idx] + '. ' + escapeHtml(q.options[idx])).join(', ') : '(nothing)';
      const correctList = q.answers.map(idx => revLetters[idx] + '. ' + escapeHtml(q.options[idx])).join(', ');
      answerHTML = '<div class="review-answer your-answer ' + (isCorrect ? 'correct' : 'wrong') + '">' +
        (isCorrect ? '✓ ' : '✗ ') + 'You selected: ' + yourList + '</div>';
      if (!isCorrect) answerHTML += '<div class="review-answer correct-answer">✓ Correct: ' + correctList + '</div>';
    } else if (q.type === 'fillin') {
      const gotRight = chosen === '__correct__';
      answerHTML = '<div class="review-answer your-answer ' + (gotRight ? 'correct' : 'wrong') + '">' +
        (gotRight ? '✓ You typed: ' : '✗ You typed: ') + escapeHtml(gotRight ? q.answers[0] : chosen) + '</div>';
      if (!gotRight) answerHTML += '<div class="review-answer correct-answer">✓ Correct: ' + escapeHtml(q.answers[0]) + '</div>';
    } else if (isCorrect) {
      answerHTML = '<div class="review-answer your-answer correct">✓ You answered: ' + revLetters[chosen] + '. ' + escapeHtml(q.options[chosen]) + '</div>';
    } else {
      answerHTML =
        '<div class="review-answer your-answer wrong">✗ You answered: ' + revLetters[chosen] + '. ' + escapeHtml(q.options[chosen]) + '</div>' +
        '<div class="review-answer correct-answer">✓ Correct: ' + revLetters[q.answer] + '. ' + escapeHtml(q.options[q.answer]) + '</div>';
    }

    div.innerHTML =
      '<div class="review-meta">' +
        '<span class="week-tag">Week ' + q.week + '</span>' +
        '<span class="topic-tag">' + q.topic + '</span>' +
        (bookmarks.has(i) ? '<span class="bookmark-marker">⭐</span>' : '') +
      '</div>' +
      '<p class="question-text">Q' + (i + 1) + '. ' + q.question + '</p>' +
      answerHTML +
      '<p class="review-explanation">' + q.explanation + '</p>';

    list.appendChild(div);
  });
}

// ── SAVE SESSION TO LOCALSTORAGE ─────────────────────
function saveSession() {
  const score = answers.filter((a, i) => {
    if (a === null) return false;
    const q = quizQuestions[i];
    return isAnswerCorrect(q, a);
  }).length;
  const total = quizQuestions.length;

  const topicScores = {};
  quizQuestions.forEach((q, i) => {
    const t = q.topic;
    if (!topicScores[t]) topicScores[t] = { correct: 0, total: 0 };
    topicScores[t].total++;
    if (isAnswerCorrect(q, answers[i])) topicScores[t].correct++;
  });

  const session = {
    date:        new Date().toISOString(),
    score,
    total,
    pct:         Math.round(score / total * 100),
    mode:        quizMode === 'random' ? 'Random 15' : 'All (' + total + 'q)',
    timerUsed:   timerEnabled,
    topicScores
  };

  const history = getHistory();
  history.unshift(session);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch(e) {}
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch(e) { return []; }
}

// ── STATS SCREEN ─────────────────────────────────────
document.getElementById('btn-view-stats').addEventListener('click', () => {
  buildStats();
  showScreen('stats');
});
document.getElementById('btn-back-home-stats').addEventListener('click', () => showScreen('start'));

function buildStats() {
  const history = getHistory();

  // ── History list ──
  const hl = document.getElementById('history-list');
  if (history.length === 0) {
    hl.innerHTML = '<p class="empty-msg">No sessions recorded yet.</p>';
  } else {
    hl.innerHTML = '';
    history.forEach(s => {
      const cls   = s.pct >= 75 ? 'great' : s.pct >= 50 ? 'ok' : 'poor';
      const date  = new Date(s.date);
      const dateStr = date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit' });
      const timeStr = date.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML =
        '<div class="hist-left">' +
          '<span class="hist-score ' + cls + '">' + s.score + '/' + s.total + ' — ' + s.pct + '%</span>' +
          '<span class="hist-meta">' + (s.timerUsed ? '⏱ Timed' : 'No timer') + '</span>' +
        '</div>' +
        '<div class="hist-right">' +
          '<span class="hist-mode">' + s.mode + '</span>' +
          '<span class="hist-date">' + dateStr + ' ' + timeStr + '</span>' +
        '</div>';
      hl.appendChild(row);
    });
  }

  // ── Weak topics ──
  const wl = document.getElementById('weak-topics-list');
  const aggregate = {};
  history.forEach(s => {
    Object.entries(s.topicScores || {}).forEach(([topic, d]) => {      if (!aggregate[topic]) aggregate[topic] = { correct: 0, total: 0 };
      aggregate[topic].correct += d.correct;
      aggregate[topic].total   += d.total;
    });
  });

  const topics = Object.entries(aggregate)
    .map(([topic, d]) => ({ topic, pct: Math.round(d.correct / d.total * 100), correct: d.correct, total: d.total }))
    .sort((a, b) => a.pct - b.pct);

  if (topics.length === 0) {
    wl.innerHTML = '<p class="empty-msg">Complete at least one quiz to see your weak spots.</p>';
  } else {
    wl.innerHTML = '';
    topics.forEach(t => {
      const color = t.pct >= 75 ? 'var(--green)' : t.pct >= 50 ? 'var(--yellow)' : 'var(--red)';
      const row = document.createElement('div');
      row.className = 'weak-row';
      row.innerHTML =
        '<span class="weak-name">' + t.topic + '</span>' +
        '<div class="weak-bar-wrap"><div class="weak-bar" style="width:' + t.pct + '%;background:' + color + '"></div></div>' +
        '<span class="weak-pct" style="color:' + color + '">' + t.pct + '%</span>';
      wl.appendChild(row);
    });
  }
}

// ── SHOW RECENT SCORES ON START ───────────────────────
function renderRecentScores() {
  const history = getHistory();
  const section = document.getElementById('recent-section');
  const box     = document.getElementById('recent-scores');
  if (history.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  box.innerHTML = '';
  history.slice(0, 5).forEach(s => {
    const cls = s.pct >= 75 ? 'great' : s.pct >= 50 ? 'ok' : 'poor';
    const d   = new Date(s.date);
    const ds  = d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
    const chip = document.createElement('div');
    chip.className = 'recent-score-chip';
    chip.innerHTML =
      '<div class="rsc-score ' + cls + '">' + s.score + '/' + s.total + '</div>' +
      '<div class="rsc-date">' + ds + '</div>';
    box.appendChild(chip);
  });
}

// ── INIT ─────────────────────────────────────────────
(async function init() {
  showScreen('start');
  await loadQuestions();
  updateStartCount();
  renderRecentScores();
})();
