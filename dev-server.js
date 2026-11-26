'use strict';

// 로컬 시험용 서버: Vercel과 같은 구조(public/ 정적 파일 + api/router.js)로 이 PC에서 돌려 봅니다.
// 실행: node dev-server.js  →  http://127.0.0.1:3000
// Vercel 배포에는 쓰이지 않습니다.

const http = require('http');
const fs = require('fs');
const path = require('path');
const router = require('./api/router');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const m = url.pathname.match(/^\/api\/(status|places|routes)\/?$/);
    if (m) {
        req.url = `/api/router?action=${m[1]}`;
        return router(req, res);
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404;
        return res.end('Not found');
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`SafeRoute (Vercel 구조) 로컬 시험: http://127.0.0.1:${PORT}`));
