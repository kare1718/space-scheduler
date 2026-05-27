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

// ===== AI: 자연어 설명 → 스케줄 설정(JSON) 파싱 =====
// 키는 요청 본문(앱에 붙여넣은 키) 또는 서버 환경변수에서 가져옴.
// 제공자: 키 접두사(AIza=Gemini, sk-ant-=Claude, sk-=OpenAI)로 자동 판별.
// 효율 우선순위(env만 있을 때): Gemini → OpenAI → Anthropic.
const AI_SYS = [
  '당신은 행사/매장 인력 스케줄 설정 파서입니다. 한국어 근무 조건 설명을 읽고 아래 JSON 스키마에 정확히 맞는 JSON만 출력하세요. 설명·마크다운·코드펜스 없이 순수 JSON만.',
  '',
  '핵심 개념 = "풀(pool)": 한 파트(또는 같이 묶이는 파트들)를 담당하는 인원 그룹. 풀 안에서 일부는 근무, 일부는 휴게로 돌아가며 교대합니다.',
  '',
  '스키마:',
  '{',
  '  "openH": 정수(0~24, 오픈 시각, 24시간제),',
  '  "closeH": 정수(0~24, 마감 시각),',
  '  "maxParts": 정수(한 사람이 맡을 수 있는 최대 파트 수. 명시 없으면 2),',
  '  "restMode": "smart" | "rotate" | "push" (명시 없으면 "smart"),',
  '  "coverPool": 문자열(인원이 부족할 때 다른 파트를 대신 커버하는 풀 이름. 없으면 ""),',
  '  "pools": [ { "name": 풀 이름, "size": 그 풀의 전체 담당 인원 수, "parts": [ { "name": 파트명, "min": 그 파트 동시 상시 근무 최소 인원 } ] } ],',
  '  "notes": 문자열(해석이 애매했던 부분이나 가정. 한국어)',
  '}',
  '',
  '해석 규칙:',
  '- "11:00-19:00" 또는 "11시~19시" → openH 11, closeH 19. 앞뒤 준비시간은 무시하고 명시된 운영시간 그대로.',
  '- "A파트 6명 중 4명 상시 근무" → pools에 {name:"A", size:6, parts:[{name:"A", min:4}]}.',
  '- "X, Y 3명 중 각각 1명씩 상시" → X,Y가 인원 3명을 공유하는 한 풀: {name:"X·Y", size:3, parts:[{name:"X",min:1},{name:"Y",min:1}]}.',
  '- 전체 인원 staffCount = 모든 풀 size 의 합 (공유 풀은 1번만).',
  '- coverPool = "대기라인"처럼 부족분을 메우라고 지정된 풀 이름. 보통 가장 큰 풀.',
  '- 모든 인원이 동일한 휴게시간을 갖는 것은 기본 동작이므로 별도 필드 불필요.',
  '',
  '예시 입력: "운영 11~19시. 대기라인 6명 중 4명 상시, 커스텀 3명 중 2명 상시, 럭키드로우·포토존 3명 중 각각 1명씩 상시, 세일즈존 3명 중 2명 상시. 부족하면 대기라인이 커버."',
  '예시 출력: {"openH":11,"closeH":19,"maxParts":2,"restMode":"smart","coverPool":"대기라인","pools":[{"name":"대기라인","size":6,"parts":[{"name":"대기라인","min":4}]},{"name":"커스텀","size":3,"parts":[{"name":"커스텀","min":2}]},{"name":"럭키드로우·포토존","size":3,"parts":[{"name":"럭키드로우","min":1},{"name":"포토존","min":1}]},{"name":"세일즈존","size":3,"parts":[{"name":"세일즈존","min":2}]}],"notes":"럭키드로우·포토존은 3명 공유 풀"}'
].join('\n');
function aiUserPrompt(text){ return '다음 조건을 위 스키마의 JSON으로 변환하세요:\n\n' + text; }

function aiPick(bodyKey){
  if(bodyKey){
    if(bodyKey.startsWith('sk-ant-')) return {provider:'anthropic', key:bodyKey};
    if(bodyKey.startsWith('AIza'))    return {provider:'gemini',    key:bodyKey};
    if(bodyKey.startsWith('sk-'))     return {provider:'openai',    key:bodyKey};
    return {provider:'gemini', key:bodyKey};
  }
  const g = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if(g) return {provider:'gemini', key:g};
  if(process.env.OPENAI_API_KEY)    return {provider:'openai',    key:process.env.OPENAI_API_KEY};
  if(process.env.ANTHROPIC_API_KEY) return {provider:'anthropic', key:process.env.ANTHROPIC_API_KEY};
  return null;
}

async function aiGemini(key, text){
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
    system_instruction:{ parts:[{ text: AI_SYS }] },
    contents:[{ role:'user', parts:[{ text: aiUserPrompt(text) }] }],
    generationConfig:{ temperature:0.1, responseMimeType:'application/json' }
  }) });
  if(!r.ok) throw new Error('Gemini ' + r.status + ' ' + (await r.text()).slice(0,300));
  const j = await r.json();
  return ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p=>p.text||'').join('');
}
async function aiOpenAI(key, text){
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key}, body: JSON.stringify({
    model, temperature:0.1, response_format:{ type:'json_object' },
    messages:[{ role:'system', content: AI_SYS }, { role:'user', content: aiUserPrompt(text) }]
  }) });
  if(!r.ok) throw new Error('OpenAI ' + r.status + ' ' + (await r.text()).slice(0,300));
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}
async function aiAnthropic(key, text){
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
  const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'}, body: JSON.stringify({
    model, max_tokens:1024, temperature:0.1, system: AI_SYS,
    messages:[{ role:'user', content: aiUserPrompt(text) + '\n\n반드시 순수 JSON만 출력.' }]
  }) });
  if(!r.ok) throw new Error('Anthropic ' + r.status + ' ' + (await r.text()).slice(0,300));
  const j = await r.json();
  return ((j.content) || []).map(c=>c.text||'').join('');
}
function aiExtractJSON(t){
  if(!t || !t.trim()) throw new Error('AI 응답이 비었습니다.');
  let s = t.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if(a>=0 && b>a) s = s.slice(a, b+1);
  return JSON.parse(s);
}

app.post('/api/ai-schedule', async (req, res) => {
  try{
    const text = ((req.body && req.body.text) || '').toString().trim();
    if(!text) return res.status(400).json({ ok:false, error:'설명 텍스트가 비어 있습니다.' });
    const bodyKey = ((req.body && req.body.key) || '').toString().trim();
    const sel = aiPick(bodyKey);
    if(!sel) return res.status(400).json({ ok:false, needKey:true, error:'AI 키가 없습니다. 앱 설정에 API 키를 붙여넣거나, 서버 환경변수(GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)를 등록하세요.' });
    if(typeof fetch !== 'function') return res.status(500).json({ ok:false, error:'서버 Node 버전이 fetch를 지원하지 않습니다(18+ 필요).' });
    let raw;
    if(sel.provider==='gemini')      raw = await aiGemini(sel.key, text);
    else if(sel.provider==='openai') raw = await aiOpenAI(sel.key, text);
    else                             raw = await aiAnthropic(sel.key, text);
    const config = aiExtractJSON(raw);
    res.json({ ok:true, provider: sel.provider, config });
  }catch(e){
    res.status(500).json({ ok:false, error: String((e && e.message) || e) });
  }
});

app.listen(PORT, () => console.log(`PREFER scheduler server on :${PORT} (data: ${DATA_FILE})`));
