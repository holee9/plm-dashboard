// 주요 과제 선택 (#110): server-side validation and atomic write of data/config/tracked-projects.json.
// PUT only. The body must be a JSON object {"version":1,"excluded":[identifier,...],"updated_at"?:string}.
// Anything else is rejected with 400 and the existing file is not touched. A valid body is written to a temp
// file in the same directory and renamed over the setting file, so readers never see a half-written file.
// The server (not the client) stamps updated_at.
var fs = require('fs');

var DIR = '/dashboard/data/config/';
var FILE = DIR + 'tracked-projects.json';
var MAX_ITEMS = 500;
var IDENT = /^[A-Za-z0-9_.-]{1,64}$/;
var KEYS = { version: 1, excluded: 1, updated_at: 1 };

function reply(r, code, message) {
    r.headersOut['Content-Type'] = 'application/json; charset=utf-8';
    r.headersOut['Cache-Control'] = 'no-store';
    r.return(code, JSON.stringify({ error: message }));
}

// returns an error message, or null when the object is a valid setting
function check(j) {
    if (j === null || typeof j !== 'object' || Array.isArray(j)) return '최상위 값이 객체가 아닙니다';
    var k;
    for (k in j) { if (!Object.prototype.hasOwnProperty.call(KEYS, k)) return '알 수 없는 항목: ' + String(k).slice(0, 32); }
    if (j.version !== 1) return 'version은 1이어야 합니다';
    if (!Array.isArray(j.excluded)) return 'excluded는 배열이어야 합니다';
    if (j.excluded.length > MAX_ITEMS) return 'excluded는 ' + MAX_ITEMS + '개를 넘을 수 없습니다';
    var seen = Object.create(null);   // a plain {} would already hold 'constructor', 'toString', ... and reject them as duplicates
    for (var i = 0; i < j.excluded.length; i++) {
        var id = j.excluded[i];
        if (typeof id !== 'string' || !IDENT.test(id)) return 'excluded[' + i + ']가 과제 식별자 형식이 아닙니다';
        if (seen[id]) return 'excluded에 중복이 있습니다: ' + id;
        seen[id] = 1;
    }
    if (j.updated_at !== undefined && (typeof j.updated_at !== 'string' || j.updated_at.length > 40)) return 'updated_at 형식이 아닙니다';
    return null;
}

function save(r) {
    if (r.method !== 'PUT') {
        r.headersOut['Allow'] = 'GET, HEAD, PUT';
        return reply(r, 405, '허용되지 않는 방법입니다');
    }
    var body = r.requestText;
    if (typeof body !== 'string' || body.length === 0) return reply(r, 400, '본문이 비어 있습니다');
    var j;
    try { j = JSON.parse(body); } catch (e) { return reply(r, 400, 'JSON 형식이 아닙니다'); }
    var bad = check(j);
    if (bad) return reply(r, 400, bad);

    var out = JSON.stringify({ version: 1, excluded: j.excluded.slice().sort(), updated_at: new Date().toISOString() });
    var tmp = DIR + '.tracked-projects.' + r.variables.request_id + '.tmp';
    try {
        fs.writeFileSync(tmp, out, { mode: 0o644 });
        fs.renameSync(tmp, FILE);
    } catch (e) {
        try { fs.unlinkSync(tmp); } catch (e2) { /* no temp file left to remove */ }
        r.error('tracked-projects save failed: ' + e);
        return reply(r, 500, '저장하지 못했습니다');
    }
    r.return(204);
}

export default { save: save };
