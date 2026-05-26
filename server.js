const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// 데이터 저장 위치: Render 영구 디스크 등은 DATA_DIR 환경변수로 지정.
// (지정 없으면 앱 폴더 — 로컬 개발용. Render 무료 플랜은 재시작 시 초기화되므로
//  다기기 영구 보존을 원하면 영구 디스크 + DATA_DIR 사용 권장)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* 무시 */ }

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

// 헬스체크 (배포 상태 확인용)
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// API: 데이터 가져오기
app.get('/api/data', (req, res) => {
  res.json(loadData());
});

// API: 데이터 저장
app.post('/api/data', (req, res) => {
  try { saveData(req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
});

app.listen(PORT, () => console.log(`PREFER scheduler server on :${PORT} (data: ${DATA_FILE})`));
