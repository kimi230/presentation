const express = require('express');
const Database = require('better-sqlite3');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'votes.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('A','B')),
    voter_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_quiz ON votes(quiz_id, voter_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tool_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_voter ON tool_votes(tool_name, voter_id)`);

app.use(express.json());
app.use(express.static(__dirname));

// --- Active quiz state ---
let activeQuiz = 0; // 0 = no quiz active, 1-3 = quiz number
let currentSlide = 0; // current slide index for audience sync

// --- SSE ---
let clients = [];

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send current state
  res.write(`data: ${JSON.stringify({ type: 'active', quizId: activeQuiz })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'slide', slideIndex: currentSlide })}\n\n`);
  for (let q = 1; q <= 3; q++) {
    res.write(`data: ${JSON.stringify({ type: 'results', quizId: q, results: getResults(q) })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: 'tool-results', results: getToolResults() })}\n\n`);

  clients.push(res);
  req.on('close', () => { clients = clients.filter(c => c !== res); });
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.write(msg));
}

// --- Helpers ---
const stmtVote = db.prepare('INSERT OR REPLACE INTO votes (quiz_id, choice, voter_id) VALUES (?, ?, ?)');
const stmtResults = db.prepare('SELECT choice, COUNT(*) as count FROM votes WHERE quiz_id = ? GROUP BY choice');
const stmtDelete = db.prepare('DELETE FROM votes WHERE quiz_id = ?');
const stmtDeleteAll = db.prepare('DELETE FROM votes');

function getResults(quizId) {
  const rows = stmtResults.all(quizId);
  const r = { A: 0, B: 0 };
  rows.forEach(row => { r[row.choice] = row.count; });
  return r;
}

// --- API ---

// Set active quiz (called by presenter when navigating slides)
app.post('/api/active/:quizId', (req, res) => {
  const val = req.params.quizId;
  activeQuiz = (val === 'qa' || val === 'tools') ? val : Number(val);
  broadcast({ type: 'active', quizId: activeQuiz });
  res.json({ ok: true, quizId: activeQuiz });
});

app.get('/api/active', (req, res) => {
  res.json({ quizId: activeQuiz });
});

// Slide sync (called by presenter on slide change)
app.post('/api/slide/:num', (req, res) => {
  currentSlide = Number(req.params.num);
  broadcast({ type: 'slide', slideIndex: currentSlide });
  res.json({ ok: true });
});

app.get('/api/slide', (req, res) => {
  res.json({ slideIndex: currentSlide });
});

// Vote
app.post('/api/vote/:quizId', (req, res) => {
  const quizId = Number(req.params.quizId);
  const { choice, voterId } = req.body;

  if (![1, 2, 3].includes(quizId)) return res.status(400).json({ error: 'Invalid quiz' });
  if (!['A', 'B'].includes(choice)) return res.status(400).json({ error: 'Invalid choice' });
  if (!voterId) return res.status(400).json({ error: 'Missing voterId' });

  stmtVote.run(quizId, choice, voterId);
  const results = getResults(quizId);
  broadcast({ type: 'results', quizId, results });
  res.json({ ok: true, results });
});

app.get('/api/results/:quizId', (req, res) => {
  res.json(getResults(Number(req.params.quizId)));
});

app.post('/api/reset/:quizId', (req, res) => {
  const quizId = Number(req.params.quizId);
  stmtDelete.run(quizId);
  broadcast({ type: 'results', quizId, results: { A: 0, B: 0 } });
  res.json({ ok: true });
});

app.post('/api/reset-all', (req, res) => {
  stmtDeleteAll.run();
  for (let q = 1; q <= 3; q++) broadcast({ type: 'results', quizId: q, results: { A: 0, B: 0 } });
  res.json({ ok: true });
});

// --- Tool Poll ---
const TOOLS = ['ChatGPT','Claude','Copilot','Llama','Perplexity','Gemini','Grok'];
const stmtToolVote = db.prepare('INSERT OR IGNORE INTO tool_votes (tool_name, voter_id) VALUES (?, ?)');
const stmtToolDelete = db.prepare('DELETE FROM tool_votes WHERE tool_name = ? AND voter_id = ?');
const stmtToolResults = db.prepare('SELECT tool_name, COUNT(*) as count FROM tool_votes GROUP BY tool_name');
const stmtToolVoterCount = db.prepare('SELECT COUNT(DISTINCT voter_id) as count FROM tool_votes');
const stmtToolByVoter = db.prepare('SELECT tool_name FROM tool_votes WHERE voter_id = ?');
const stmtToolReset = db.prepare('DELETE FROM tool_votes');

function getToolResults() {
  const rows = stmtToolResults.all();
  const r = {};
  TOOLS.forEach(t => { r[t] = 0; });
  rows.forEach(row => { r[row.tool_name] = row.count; });
  r._voters = stmtToolVoterCount.get().count;
  return r;
}

app.post('/api/tool-vote', (req, res) => {
  const { tools, voterId } = req.body;
  if (!voterId || !Array.isArray(tools)) return res.status(400).json({ error: 'Invalid' });
  // Get current selections for this voter
  const current = stmtToolByVoter.all(voterId).map(r => r.tool_name);
  // Add new selections
  tools.filter(t => TOOLS.includes(t) && !current.includes(t)).forEach(t => stmtToolVote.run(t, voterId));
  // Remove deselected
  current.filter(t => !tools.includes(t)).forEach(t => stmtToolDelete.run(t, voterId));
  const results = getToolResults();
  broadcast({ type: 'tool-results', results });
  res.json({ ok: true, results });
});

app.get('/api/tool-results', (req, res) => {
  res.json(getToolResults());
});

app.post('/api/tool-reset', (req, res) => {
  stmtToolReset.run();
  const results = getToolResults();
  broadcast({ type: 'tool-results', results });
  broadcast({ type: 'tool-reset' });
  res.json({ ok: true });
});

// --- Q&A ---
const stmtInsertQ = db.prepare('INSERT INTO questions (text, voter_id) VALUES (?, ?)');
const stmtAllQ = db.prepare('SELECT id, text, created_at FROM questions ORDER BY id ASC');
const stmtDeleteQ = db.prepare('DELETE FROM questions');

app.post('/api/question', (req, res) => {
  const { text, voterId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty question' });
  if (!voterId) return res.status(400).json({ error: 'Missing voterId' });
  const info = stmtInsertQ.run(text.trim().slice(0, 200), voterId);
  const question = { id: info.lastInsertRowid, text: text.trim().slice(0, 200) };
  broadcast({ type: 'question', question });
  res.json({ ok: true, question });
});

app.get('/api/questions', (req, res) => {
  res.json(stmtAllQ.all());
});

app.post('/api/questions/reset', (req, res) => {
  stmtDeleteQ.run();
  broadcast({ type: 'questions-reset' });
  res.json({ ok: true });
});

// --- QR Code (single entry point) ---
app.get('/api/qr', async (req, res) => {
  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}/vote.html`;
  try {
    if (req.query.format === 'png') {
      const png = await QRCode.toBuffer(url, {
        type: 'png',
        width: 280,
        margin: 1,
        color: { dark: '#0F1B2D', light: '#FFFFFF' }
      });
      res.type('png').send(png);
    } else {
      const svg = await QRCode.toString(url, {
        type: 'svg',
        margin: 1,
        color: { dark: '#0F1B2D', light: '#FFFFFF' }
      });
      res.type('svg').send(svg);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Server Info ---
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('  ┌──────────────────────────────────────────┐');
  console.log(`  │  프레젠테이션:  http://${ip}:${PORT}         │`);
  console.log(`  │  투표 참여:     http://${ip}:${PORT}/vote.html  │`);
  console.log('  └──────────────────────────────────────────┘');
  console.log('');
  console.log('  청중이 QR 한번 스캔하면 자동으로 퀴즈가 따라갑니다.');
  console.log('');
});
