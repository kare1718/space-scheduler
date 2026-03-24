const CACHE='spaceschV5';
const URLS=['./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())
));
// 네트워크 우선: 항상 최신 버전 가져오고, 오프라인일 때만 캐시 사용
self.addEventListener('fetch',e=>{
  e.respondWith(
    fetch(e.request).then(res=>{
      if(res.status===200){const cl=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cl));}
      return res;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
});
