const CACHE='spaceschV7';
const URLS=['./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
));
// 네트워크 우선 + 장애 복원:
//  - API(/api/*) 요청은 가로채지 않음 (앱이 직접 try/catch 처리)
//  - 5xx(배포 중 502/503 등)거나 네트워크 실패면 캐시로 폴백 → 오류/502 화면 대신 앱 유지
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||req.url.indexOf('/api/')!==-1) return; // API·비GET은 통과
  e.respondWith(
    fetch(req).then(res=>{
      if(res&&res.status>=500){                                   // 서버 오류(예: 업데이트 중 502)
        return caches.match(req).then(c=>c||caches.match('./index.html')||res);
      }
      if(res&&res.status===200){const cl=res.clone();caches.open(CACHE).then(c=>c.put(req,cl));}
      return res;
    }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
  );
});
