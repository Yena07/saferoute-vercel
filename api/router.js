'use strict';

// SafeRoute API (Vercel 서버리스 함수)
// /api/status, /api/places, /api/routes 를 한 함수에서 처리합니다 (vercel.json의 rewrites).
// 카카오 REST API 키는 사용자가 화면에서 입력한 값만 씁니다. 서버에 키를 저장하지 않습니다.

const path = require('path');

const { makeIndexProvider } = require('../lib/matcher');
const { searchPlaces, findRoutes, normalizeDetourCap } = require('../lib/kakao');

const MAX_BODY_BYTES = 16384;

// 함수가 따뜻한(warm) 동안 재사용
const index = makeIndexProvider(path.join(__dirname, '..', 'lib', 'data', 'tiles'));
const modelStatus = index.status();

if (
    !index.national ||
    modelStatus.model_version !== 'TAAS1' ||
    modelStatus.policy_version !== 'P01' ||
    modelStatus.tile_schema_version !== 'TAAS1-P01-tiles-v1'
) {
    throw new Error('TAAS1/P01 전국 도로 데이터 설정이 올바르지 않습니다.');
}


function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
}


function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}


// Vercel은 JSON 본문을 미리 읽어 req.body에 넣기도 하고, 로컬 시험 서버는 스트림 그대로 넘깁니다.
async function readJson(req) {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
        throw httpError(415, 'JSON 요청만 받습니다.');
    }

    let body = req.body;

    if (body === undefined) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                throw httpError(413, '요청 크기가 너무 큽니다.');
            }
            chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString('utf8');
    }

    if (Buffer.isBuffer(body)) {
        body = body.toString('utf8');
    }

    if (typeof body === 'string') {
        if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
            throw httpError(413, '요청 크기가 너무 큽니다.');
        }
        try {
            body = JSON.parse(body);
        } catch {
            throw httpError(400, 'JSON 요청 형식이 올바르지 않습니다.');
        }
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw httpError(400, 'JSON 객체를 입력하세요.');
    }
    return body;
}


// 다른 사이트에서 이 API를 부르지 못하게, 브라우저가 보낸 Origin이 이 사이트 주소일 때만 허용
function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) {
        return true;
    }
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}


function actionOf(req) {
    const url = new URL(req.url, 'http://localhost');
    const action = url.searchParams.get('action') || url.pathname.replace(/^\/api\//, '');
    return action.replace(/\/+$/, '');
}


module.exports = async function handler(req, res) {
    try {
        const action = actionOf(req);

        if (action === 'status') {
            if (req.method !== 'GET') {
                return send(res, 405, { error: 'GET 요청만 허용합니다.' });
            }
            return send(res, 200, {
                api_key_from_environment: false,
                ...modelStatus,
                model_scope: '전국 표준 도로망이 매칭된 경로만',
                minimum_coverage: 0.8,
                minimum_distinct_candidates: 2,
                search_target_candidates: 3,
                policy_revision: 'P01-v1.1',
                score_meaning: 'predicted_accidents_per_km_national_percentile',
                deployment_status: 'vercel'
            });
        }

        if (req.method !== 'POST' || !['places', 'routes'].includes(action)) {
            return send(res, 404, { error: '없는 API입니다.' });
        }

        if (!sameOrigin(req)) {
            return send(res, 403, { error: '이 사이트 화면에서만 요청할 수 있습니다.' });
        }

        const body = await readJson(req);
        const key = String(body.key || '').trim();

        if (!key) {
            return send(res, 400, { error: '카카오 REST API 키를 입력하세요.' });
        }

        if (action === 'places') {
            const places = await searchPlaces(body.query, key);
            return send(res, 200, { places });
        }

        if (body.detour_cap === undefined || body.detour_cap === null) {
            return send(res, 400, { error: '우회 범위를 확인하세요.' });
        }

        const cap = normalizeDetourCap(body.detour_cap);
        const result = await findRoutes(body.origin, body.destination, key, index, fetch, cap);

        return send(res, 200, {
            ...result,
            detour_cap: cap === Infinity ? 'unlimited' : cap,   // Infinity의 JSON null 변환 방지
            model_version: modelStatus.model_version,
            policy_version: modelStatus.policy_version,
            tile_schema_version: modelStatus.tile_schema_version
        });

    } catch (error) {
        if (res.headersSent) {
            return res.end();
        }
        const status = (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599)
            ? error.status : 400;
        return send(res, status, { error: error.message || '요청 처리에 실패했습니다.' });
    }
};
