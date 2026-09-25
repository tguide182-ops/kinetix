import http from 'node:http';

const ts = (n) => { const b = Buffer.alloc(188 * n); for (let i = 0; i < n; i++) b[i * 188] = 0x47; return b; };
const mp4 = (size) => { const b = Buffer.alloc(size); b.writeUInt32BE(32, 0); b.write('ftypisom', 4); return b; };
const webm = (size) => { const b = Buffer.alloc(size); b.set([0x1a, 0x45, 0xdf, 0xa3]); return b; };

const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
720/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360/index.m3u8
`;
const media = (q) => `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:4,
seg0.ts
#EXTINF:4,
seg1.ts
#EXTINF:2,
seg2.ts
#EXT-X-ENDLIST
`;
const mpd = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT8S">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <SegmentTemplate media="$RepresentationID$/$Number$.m4s" initialization="$RepresentationID$/init.mp4" duration="4" startNumber="1"/>
      <Representation id="v1080" bandwidth="4000000" width="1920" height="1080"/>
      <Representation id="v480" bandwidth="900000" width="854" height="480"/>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="en">
      <SegmentTemplate media="$RepresentationID$/$Number$.m4s" initialization="$RepresentationID$/init.mp4" duration="4" startNumber="1"/>
      <Representation id="a128" bandwidth="128000"/>
    </AdaptationSet>
  </Period>
</MPD>`;
const drmMpd = mpd.replace('<AdaptationSet contentType="video" mimeType="video/mp4">', '<AdaptationSet contentType="video" mimeType="video/mp4"><ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>');

const page = `<!doctype html><html><head><title>Example Documentary | Testsite</title></head><body>
<h1>Test page</h1>
<figure><video id="v1" src="/media/clip.mp4?utm_source=news" poster="/poster.png" title="Example Documentary" controls width="640" height="360"></video><figcaption>Caption</figcaption></figure>
<a href="/media/song.mp3">Song download</a>
<a href="/about.html">About</a>
<script>
setTimeout(() => { const v = document.createElement('video'); v.src = '/media/late.webm'; document.body.appendChild(v); }, 500);
setTimeout(() => { fetch('/hls/master.m3u8').then(r => r.text()); }, 700);
setTimeout(() => { const x = new XMLHttpRequest(); x.open('GET', '/dash/manifest.mpd'); x.send(); }, 900);
['success','failure','open','no_input'].forEach((n) => { const a = new Audio('/sounds/' + n + '.mp3'); a.preload = 'auto'; a.load(); });
setTimeout(() => { fetch('/drm/manifest.mpd').then(r => r.text()); }, 1000);
setTimeout(() => { const b = new Blob([new Uint8Array(200000)], {type:'video/mp4'}); const u = URL.createObjectURL(b); const v = document.createElement('video'); v.src = u; document.body.appendChild(v); }, 1100);
</script></body></html>`;

const spa = `<!doctype html><html><head><title>SPA Home</title></head><body><div id="app"><video src="/media/home.mp4"></video></div>
<script>
window.go = () => { history.pushState({}, '', '/spa/watch/2'); document.title = 'SPA Video Two'; document.getElementById('app').innerHTML = '<video src="/media/two.mp4"></video>'; };
</script></body></html>`;

const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'+'1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

export function start(port = 0) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname);
    const send = (type, body, status = 200) => { res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' }); res.end(body); };
    const p = u.pathname;
    if (p === '/' || p === '/index.html') return send('text/html', page);
    if (p.startsWith('/spa')) return send('text/html', spa);
    if (p === '/poster.png') return send('image/png', png);
    if (p === '/media/clip.mp4' || p === '/media/home.mp4' || p === '/media/two.mp4') return send('video/mp4', mp4(300000));
    if (p === '/media/late.webm') return send('video/webm', webm(200000));
    if (p === '/media/song.mp3') return send('audio/mpeg', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200000)]));
    if (p.startsWith('/sounds/')) return send('audio/mpeg', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(12000)]));
    if (p === '/media/forbidden.mp4') return send('text/plain', 'no', 403);
    if (p === '/hls/master.m3u8') return send('application/vnd.apple.mpegurl', master);
    if (/^\/hls\/\d+\/index\.m3u8$/.test(p)) return send('application/vnd.apple.mpegurl', media());
    if (/^\/hls\/\d+\/seg\d\.ts$/.test(p)) return send('video/mp2t', ts(50));
    if (p === '/dash/manifest.mpd') return send('application/dash+xml', mpd);
    if (p === '/drm/manifest.mpd') return send('application/dash+xml', drmMpd);
    if (/^\/dash\/\w+\/init\.mp4$/.test(p)) return send('video/mp4', mp4(800));
    if (/^\/dash\/\w+\/\d\.m4s$/.test(p)) { const b = Buffer.alloc(5000); b.writeUInt32BE(8, 0); b.write('moof', 4); return send('video/iso.segment', b); }
    send('text/plain', 'not found', 404);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, port: server.address().port, hits })));
}
