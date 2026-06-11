const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT_DIR = __dirname;
const RESULT_DIR = path.resolve(process.env.RESULT_DIR || path.join(ROOT_DIR, 'result'));
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 256 * 1024);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 60);
const FRAME_ANCESTORS = process.env.FRAME_ANCESTORS || "'none'";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
};

const STATIC_FILES = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/style.css', 'style.css'],
    ['/main.js', 'main.js']
]);

const EXPECTED_RESULT_HEADER = [
    'model',
    'temperature',
    'judgment_id',
    'pair_id',
    'direction',
    'pair_shown_at',
    'selected_at',
    'response_time_ms',
    'response_time_sec',
    'text_a_sample_id',
    'text_a_item_id',
    'text_a',
    'text_b_sample_id',
    'text_b_item_id',
    'text_b',
    'selected_sample_id',
    'selected_item_id',
    'selected_text'
].join(',');

const rateLimitBuckets = new Map();

function sanitizeFileName(fileName) {
    const baseName = path.basename(fileName).normalize('NFKC').replace(/\.csv$/i, '');
    const safeName = baseName
        .replace(/[^\p{L}\p{N}._-]+/gu, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);

    return `${safeName || 'result'}.csv`;
}

function securityHeaders(extraHeaders = {}) {
    const headers = {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
            "object-src 'none'",
            `frame-ancestors ${FRAME_ANCESTORS}`
        ].join('; '),
        ...extraHeaders
    };

    if (FRAME_ANCESTORS === "'none'") {
        headers['X-Frame-Options'] = 'DENY';
    }

    if (process.env.ENABLE_HSTS === 'true') {
        headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }

    return headers;
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        ...securityHeaders({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        })
    });
    res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message, extraHeaders = {}) {
    res.writeHead(statusCode, securityHeaders({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extraHeaders
    }));
    res.end(message);
}

function serveStatic(req, res, url) {
    const staticFile = STATIC_FILES.get(url.pathname);

    if (!staticFile) {
        sendText(res, 404, 'Not Found');
        return;
    }

    const filePath = path.join(ROOT_DIR, staticFile);
    fs.readFile(filePath, (error, data) => {
        if (error) {
            sendText(res, 404, 'Not Found');
            return;
        }

        const mimeType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
        const cacheControl = staticFile === 'index.html'
            ? 'no-store'
            : 'public, max-age=3600';

        res.writeHead(200, securityHeaders({
            'Content-Type': mimeType,
            'Cache-Control': cacheControl
        }));
        res.end(req.method === 'HEAD' ? undefined : data);
    });
}

function clientIp(req) {
    return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(req) {
    const now = Date.now();
    const key = clientIp(req);
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        rateLimitBuckets.set(key, {
            count: 1,
            resetAt: now + RATE_LIMIT_WINDOW_MS
        });
        return false;
    }

    bucket.count += 1;
    return bucket.count > RATE_LIMIT_MAX;
}

function allowedOriginsForRequest(req) {
    const host = req.headers.host;
    const requestOrigins = host ? [`http://${host}`, `https://${host}`] : [];
    return new Set([...ALLOWED_ORIGINS, ...requestOrigins]);
}

function isAllowedOrigin(req) {
    const origin = req.headers.origin;

    if (!origin) {
        return true;
    }

    return allowedOriginsForRequest(req).has(origin);
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let receivedBytes = 0;

        req.on('data', (chunk) => {
            receivedBytes += chunk.length;

            if (receivedBytes > MAX_BODY_BYTES) {
                const error = new Error('Payload too large');
                error.statusCode = 413;
                reject(error);
                req.destroy();
                return;
            }

            chunks.push(chunk);
        });

        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (error) {
                error.statusCode = 400;
                reject(error);
            }
        });

        req.on('error', reject);
    });
}

function validateResultCsv(csv) {
    const normalizedCsv = String(csv || '').replace(/^\uFEFF/, '').trimEnd();

    if (!normalizedCsv.trim()) {
        const error = new Error('CSV is required');
        error.statusCode = 400;
        throw error;
    }

    if (Buffer.byteLength(normalizedCsv, 'utf8') > MAX_BODY_BYTES) {
        const error = new Error('CSV is too large');
        error.statusCode = 413;
        throw error;
    }

    const lines = normalizedCsv.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines[0] !== EXPECTED_RESULT_HEADER || lines.length !== 46) {
        const error = new Error('Invalid result CSV');
        error.statusCode = 400;
        throw error;
    }

    return normalizedCsv;
}

async function writeUniqueResultFile(fileName, csv) {
    await fs.promises.mkdir(RESULT_DIR, { recursive: true });

    const extension = path.extname(fileName);
    const stem = path.basename(fileName, extension);
    const csvWithBom = csv.charCodeAt(0) === 0xFEFF ? csv : `\uFEFF${csv}`;

    for (let attempt = 0; attempt < 1000; attempt++) {
        const candidateName = attempt === 0 ? fileName : `${stem}_${attempt}${extension}`;
        const candidatePath = path.join(RESULT_DIR, candidateName);

        try {
            await fs.promises.writeFile(candidatePath, csvWithBom, {
                encoding: 'utf8',
                flag: 'wx'
            });
            return candidateName;
        } catch (error) {
            if (error.code === 'EEXIST') {
                continue;
            }
            throw error;
        }
    }

    const error = new Error('Could not create unique result file');
    error.statusCode = 500;
    throw error;
}

async function saveResult(req, res) {
    if (isRateLimited(req)) {
        sendJson(res, 429, { error: 'Too many requests' });
        return;
    }

    if (!isAllowedOrigin(req)) {
        sendJson(res, 403, { error: 'Forbidden origin' });
        return;
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
        sendJson(res, 415, { error: 'Content-Type must be application/json' });
        return;
    }

    const payload = await readJsonBody(req);
    const fileName = sanitizeFileName(String(payload.fileName || 'result.csv'));
    const csv = validateResultCsv(payload.csv);
    const savedFileName = await writeUniqueResultFile(fileName, csv);

    sendJson(res, 200, {
        fileName: savedFileName
    });
}

async function handleRequest(req, res) {
    let url;
    try {
        url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch (error) {
        sendText(res, 400, 'Bad Request');
        return;
    }

    if (req.method === 'POST' && url.pathname === '/save-result') {
        await saveResult(req, res);
        return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(req, res, url);
        return;
    }

    sendText(res, 405, 'Method Not Allowed', {
        'Allow': 'GET, HEAD, POST'
    });
}

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
        if (res.destroyed || res.headersSent) {
            return;
        }

        const statusCode = error.statusCode || 500;
        const message = statusCode >= 500 ? 'Could not save result' : error.message;
        sendJson(res, statusCode, { error: message });
    });
});

server.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`2択比較ランキング: http://${displayHost}:${PORT}/`);
    console.log(`結果保存先: ${RESULT_DIR}`);
});
