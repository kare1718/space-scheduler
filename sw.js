const CACHE='spaceschV15';
const URLS=['./','./index.html','./payroll.html','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
));
// 네트워크 우선 + 장애 복원:
//  - API(/api/*) 요청은 가로채지 않음 (앱이 직접 try/catch 처리)
//  - 페이지 이동(주소 열기)은 4xx/5xx·네트워크 실패 시 캐시된 앱 화면으로 폴백
//    → 사파리 등에서 서버가 일시 404(Not Found)/502 를 줘도 앱이 뜨도록 보장
//  - 그 외 GET 은 5xx·네트워크 실패 시 캐시 폴백
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||req.url.indexOf('/api/')!==-1) return; // API·비GET은 통과
  if(req.mode==='navigate'){                                     // 주소 열기(페이지 이동)
    e.respondWith(
      fetch(req).then(res=>{
        if(!res||!res.ok){                                        // 404(Not Found)·5xx 등
          return caches.match(req).then(c=>c||caches.match('./index.html')).then(c=>c||res);
        }
        const cl=res.clone();caches.open(CACHE).then(c=>c.put(req,cl));
        return res;
      }).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html')).then(c=>c||caches.match('./')))
    );
    return;
  }
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
