const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// 데이터 읽기
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { v: 1, current: null, slots: [] }; }
}

// 데이터 저장
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
}

// API: 데이터 가져오기
app.get('/api/data', (req, res) => {
  res.json(loadData());
});

// API: 데이터 저장
app.post('/api/data', (req, res) => {
  saveData(req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
