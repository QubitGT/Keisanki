/*

Copyright (C) 2026  Qubit Group of Development
https://github.com/QubitGT/Keisanki

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

*/

// 静的ページ用の読み取り専用サーバー。public/ 配下のみを配信する。
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = fs.realpathSync(path.join(__dirname, 'public'));

// 許可する拡張子のみ配信する (SVGはスクリプトを含められるため除外)
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

const securityHeaders = {
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

function send(response, status, body) {
    response.writeHead(status, { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    response.end(body);
}

// URLパスを検証し、public/ 内の候補ファイルパス一覧にして返す。不正なら null
function candidates(rawUrl) {
    if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return null;
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
    } catch {
        return null;
    }
    // NUL・バックスラッシュ・ドット始まりのセグメント(.. や隠しファイル)を拒否
    if (pathname.includes('\0') || pathname.includes('\\')) return null;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(s => s.startsWith('.'))) return null;

    const rel = segments.join('/');
    if (rel === '' || rel === 'page') return ['index.html', 'page/index.html'];
    if (pathname.endsWith('/')) return [`${rel}/index.html`];
    return [rel, `${rel}/index.html`];
}

async function resolveFile(rawUrl) {
    const list = candidates(rawUrl);
    if (!list) return null;
    for (const rel of list) {
        try {
            const real = await fs.promises.realpath(path.join(root, rel)); // シンボリックリンクも解決
            if (!real.startsWith(root + path.sep)) continue;
            const type = mimeTypes[path.extname(real).toLowerCase()];
            const stat = await fs.promises.stat(real);
            if (type && stat.isFile()) return { real, type, size: stat.size };
        } catch { /* 次の候補へ */ }
    }
    return null;
}

const server = http.createServer(async (request, response) => {
    try {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.setHeader('Allow', 'GET, HEAD');
            return send(response, 405, 'Method Not Allowed');
        }
        const file = await resolveFile(request.url);
        if (!file) return send(response, 404, 'Not Found');

        response.writeHead(200, { ...securityHeaders, 'Content-Type': file.type, 'Content-Length': file.size, 'Cache-Control': 'public, max-age=300' });
        if (request.method === 'HEAD') return response.end();
        fs.createReadStream(file.real).on('error', () => response.destroy()).pipe(response);
    } catch (error) {
        console.error('フロントエンドエラー:', error.message);
        if (!response.headersSent) send(response, 500, 'Internal Server Error');
    }
});

server.headersTimeout = 10000;
server.requestTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 50;

module.exports = { server, resolveFile };
