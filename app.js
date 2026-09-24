// ── CONFIG ──────────────────────────────────────────────────────────────────
const BASE_URL = 'https://rlgrind-backend.onrender.com';
const API_URL = `${BASE_URL}/api`;

// ── STATE ───────────────────────────────────────────────────────────────────
let token    = localStorage.getItem('rlmatch_token') || null;
let me       = null;
let socket   = null;
let currentMatch = null; // { matchId, lobbyName, lobbyPassword, opponent }

// ── UTILS ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => { $(id).classList.add('active'); };
const hide = id => { $(id).classList.remove('active'); };

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

// ── SCREENS ─────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'admin') loadAdminDisputes();
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $(`form-${tab.dataset.tab}`).classList.add('active');
  });
});

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = await api('POST', '/auth/login', {
      username: $('login-username').value.trim(),
      password: $('login-password').value
    });
    token = data.token;
    localStorage.setItem('rlmatch_token', token);
    me = data.user;
    onLoggedIn();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

$('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = await api('POST', '/auth/register', {
      username: $('reg-username').value.trim(),
      password: $('reg-password').value
    });
    token = data.token;
    localStorage.setItem('rlmatch_token', token);
    me = data.user;
    onLoggedIn();
  } catch (err) {
    $('reg-error').textContent = err.message;
  }
});

$('btn-logout').addEventListener('click', () => {
  token = null; me = null;
  localStorage.removeItem('rlmatch_token');
  if (socket) socket.disconnect();
  showScreen('auth');
});

// ── LOGGED IN ─────────────────────────────────────────────────────────────
async function onLoggedIn() {
  // Refresh profil complet
  try { me = await api('GET', '/auth/me'); } catch {}
  updateProfileUI();
  checkAdminUI();
  showScreen('main');
  showView('dashboard');
  initSocket();
}

function updateProfileUI() {
  $('profile-username').textContent = me.username;
  $('profile-rank').textContent     = me.rank;
  $('profile-elo').textContent      = me.elo;
  $('stat-wins').textContent        = me.stats.wins;
  $('stat-losses').textContent      = me.stats.losses;
  $('stat-winrate').textContent     = me.winrate;
}

function checkAdminUI() {
  const adminBtn = $('nav-btn-admin');
  if (adminBtn) {
    if (me && me.role === 'admin') {
      adminBtn.style.display = 'inline-block';
    } else {
      adminBtn.style.display = 'none';
    }
  }
}

// ── ADMIN PANEL ────────────────────────────────────────────────────────────
async function loadAdminDisputes() {
  const container = $('admin-disputes-container');
  if (!container) return;

  container.innerHTML = '<p>Chargement des litiges...</p>';

  try {
    const disputes = await api('GET', '/admin/disputes');

    if (disputes.length === 0) {
      container.innerHTML = '<p>Aucun litige en cours. Tout est calme ! 🎉</p>';
      return;
    }

    container.innerHTML = '';
    disputes.forEach(match => {
      const div = document.createElement('div');
      div.className = 'profile-card';
      div.style.marginBottom = '15px';
      div.style.flexDirection = 'column';
      div.style.alignItems = 'flex-start';

      const p1Name = match.player1?.username || 'Joueur 1';
      const p2Name = match.player2?.username || 'Joueur 2';
      const p1Id = match.player1?._id || match.player1;
      const p2Id = match.player2?._id || match.player2;

      div.innerHTML = `
        <p><strong>Match ID:</strong> ${match._id}</p>
        <p>🎮 <strong>${p1Name}</strong> (Score soumis : ${match.scoreSubmissions?.player1?.myScore ?? '?'}-${match.scoreSubmissions?.player1?.theirScore ?? '?'})</p>
        <p>🎮 <strong>${p2Name}</strong> (Score soumis : ${match.scoreSubmissions?.player2?.myScore ?? '?'}-${match.scoreSubmissions?.player2?.theirScore ?? '?'})</p>
        <div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn-primary" onclick="resolveAdminDispute('${match._id}', '${p1Id}')">Donner gagnant : ${p1Name}</button>
          <button class="btn-primary" onclick="resolveAdminDispute('${match._id}', '${p2Id}')" style="background-color: #e84118;">Donner gagnant : ${p2Name}</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="form-error">Erreur lors du chargement des litiges : ${err.message}</p>`;
  }
}

async function resolveAdminDispute(matchId, winnerId) {
  try {
    await api('POST', `/admin/disputes/${matchId}/resolve`, { winnerId });
    alert('Litige résolu avec succès !');
    loadAdminDisputes(); // Recharge la liste des litiges
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

// ── SOCKET.IO ────────────────────────────────────────────────────────────────
function initSocket() {
  socket = io(BASE_URL, { auth: { token } });

  socket.on('connect', () => console.log('[WS] connecté'));
  socket.on('connect_error', err => console.error('[WS]', err.message));

  // Match trouvé !
  socket.on('match:found', data => {
    currentMatch = data;
    $('match-me-name').textContent  = me.username;
    $('match-opp-name').textContent = data.opponent.username;
    $('lobby-name').textContent     = data.lobbyName;
    $('lobby-pass').textContent     = data.lobbyPassword;

    // Reset toutes les phases
    document.querySelectorAll('.match-phase').forEach(p => p.classList.remove('active'));
    $('match-phase-lobby').classList.add('active');
    showScreen('match');
  });

  // L'adversaire a soumis son score
  socket.on('match:opponent_submitted', () => {
    checkMatchResult();
  });
}

// ── QUEUE ────────────────────────────────────────────────────────────────────
$('btn-queue').addEventListener('click', () => {
  socket.emit('queue:join');
  $('mm-idle').classList.add('hidden');$('mm-searching').classList.remove('hidden');
});

$('btn-cancel-queue').addEventListener('click', () => {
  socket.emit('queue:leave');
  $('mm-searching').classList.add('hidden');$('mm-idle').classList.remove('hidden');
});

// ── MATCH FLOW ───────────────────────────────────────────────────────────────

// "Match terminé" → aller à la saisie de score
$('btn-match-done').addEventListener('click', () => {$('score-label-me').textContent  = me.username;
  $('score-label-opp').textContent = currentMatch.opponent.username;
  $('score-me').value  = '0';$('score-opp').value = '0';
  switchPhase('score');
});

// Soumission du score
$('btn-submit-score').addEventListener('click', async () => {
  const myScore    = parseInt($('score-me').value);
  const theirScore = parseInt($('score-opp').value);

  if (isNaN(myScore) || isNaN(theirScore)) return;

  try {
    await api('POST', `/match/${currentMatch.matchId}/submit`, { myScore, theirScore });

    // Notifie l'adversaire en temps réel
    socket.emit('match:score_submitted', {
      matchId:     currentMatch.matchId,
      opponentId: currentMatch.opponent.id || currentMatch.opponent._id
    });

    switchPhase('waiting');

    // Poll toutes les 2s pour voir si le match est résolu
    pollMatchResult();
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
});

let pollInterval = null;

function pollMatchResult() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(checkMatchResult, 2000);
}

async function checkMatchResult() {
  try {
    const match = await api('GET', `/match/${currentMatch.matchId}`);

    if (match.status === 'completed') {
      if (pollInterval) clearInterval(pollInterval);
      showResult(match);
    } else if (match.status === 'disputed') {
      if (pollInterval) clearInterval(pollInterval);
      showDispute(match);
    }
  } catch {}
}

function showResult(match) {
  const isP1    = match.player1._id === me.id || match.player1 === me.id || match.player1._id === me._id || match.player1 === me._id;
  const myChange = isP1 ? match.eloChanges.player1 : match.eloChanges.player2;
  const myGoals  = isP1 ? match.finalScore.player1Goals : match.finalScore.player2Goals;
  const oppGoals = isP1 ? match.finalScore.player2Goals : match.finalScore.player1Goals;

  const won = myGoals > oppGoals;
  const draw = myGoals === oppGoals;

  $('result-icon').textContent     = won ? '🏆' : draw ? '🤝' : '💀';
  $('result-text').textContent     = won ? 'Victoire' : draw ? 'Égalité' : 'Défaite';
  $('result-elo-change').textContent = (myChange >= 0 ? '+' : '') + myChange;
  $('result-elo-change').style.color = myChange >= 0 ? 'var(--win)' : 'var(--loss)';$('result-new-elo').textContent  = me.elo + myChange;

  switchPhase('result');
}

function showDispute(match) {
  $('dispute-reason').textContent = match.disputeReason || 'Les scores ne correspondent pas.';
  switchPhase('dispute');
}

function switchPhase(name) {
  document.querySelectorAll('.match-phase').forEach(p => p.classList.remove('active'));
  $(`match-phase-${name}`).classList.add('active');
}

// Retour au dashboard après match
['btn-back-home', 'btn-dispute-home'].forEach(id => {
  $(id).addEventListener('click', async () => {
    currentMatch = null;
    // Refresh le profil
    try { me = await api('GET', '/auth/me'); updateProfileUI(); } catch {}
    // Reset queue UI
    $('mm-searching').classList.add('hidden');$('mm-idle').classList.remove('hidden');
    showScreen('main');
    showView('dashboard');
  });
});

// ── COPY BUTTONS ─────────────────────────────────────────────────────────────
document.querySelectorAll('.btn-copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = $(btn.dataset.copy).textContent;
    navigator.clipboard.writeText(val).then(() => {
      btn.textContent = 'Copié !';
      setTimeout(() => btn.textContent = 'Copier', 1500);
    });
  });
});

// ── NAV ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ── LEADERBOARD ──────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const data = await api('GET', '/leaderboard');
    const body = $('leaderboard-body');
    body.innerHTML = data.map(p => `
      <tr>
        <td class="lb-rank-num">${p.rank}</td>
        <td>${p.username}</td>
        <td class="lb-division">${p.division}</td>
        <td>${p.elo}</td>
        <td style="color:var(--win)">${p.wins}</td>
        <td style="color:var(--loss)">${p.losses}</td>
        <td>${p.winrate}%</td>
      </tr>
    `).join('');
  } catch {}
}

// ── INIT ─────────────────────────────────────────────────────────────────────
(async () => {
  if (token) {
    try {
      me = await api('GET', '/auth/me');
      onLoggedIn();
    } catch {
      token = null;
      localStorage.removeItem('rlmatch_token');
      showScreen('auth');
    }
  } else {
    showScreen('auth');
  }
})();