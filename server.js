const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8000);
const ROOT_DIR = __dirname;
const RESULT_DIR = path.join(ROOT_DIR, 'result');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8'
};

function sanitizeFileName(fileName) {
    return path.basename(fileName).replace(/[\\/:*?"<>|]/g, '_');
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestedPath = decodeURIComponent(url.pathname);
    const relativePath = requestedPath === '/' ? '/index.html' : requestedPath;
    const filePath = path.normalize(path.join(ROOT_DIR, relativePath));

    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const mimeType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': mimeType
        });
        res.end(data);
    });
}

function saveResult(req, res) {
    let body = '';

    req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) {
            req.destroy();
        }
    });

    req.on('end', () => {
        try {
            const payload = JSON.parse(body);
            const fileName = sanitizeFileName(String(payload.fileName || 'result.csv'));
            const csv = String(payload.csv || '');

            if (!fileName.endsWith('.csv') || !csv.trim()) {
                sendJson(res, 400, { error: 'Invalid CSV payload' });
                return;
            }

            fs.mkdirSync(RESULT_DIR, { recursive: true });
            const csvWithBom = csv.charCodeAt(0) === 0xFEFF ? csv : `\uFEFF${csv}`;
            fs.writeFileSync(path.join(RESULT_DIR, fileName), csvWithBom, 'utf8');

            sendJson(res, 200, {
                fileName,
                path: `result/${fileName}`
            });
        } catch (error) {
            sendJson(res, 500, { error: 'Could not save result' });
        }
    });
}

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/save-result') {
        saveResult(req, res);
        return;
    }

    if (req.method === 'GET') {
        serveStatic(req, res);
        return;
    }

    res.writeHead(405);
    res.end('Method Not Allowed');
});

server.listen(PORT, () => {
    console.log(`2択比較ランキング: http://localhost:${PORT}/`);
    console.log(`結果保存先: ${RESULT_DIR}`);
});
