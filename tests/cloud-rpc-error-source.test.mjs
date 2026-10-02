import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The native cloud RPC client must surface the server's own diagnosis. A
// PostgREST failure reports the actionable cause only in the response body
// (PGRST202 missing function, PGRST203 bad signature, the raised exception
// text). Collapsing it to a bare status code previously hid the real endpoint
// failure behind "404 Not Found".
test('native cloud RPC rejection preserves the server response body',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  const rpc=lib.slice(lib.indexOf('async fn rpc('),lib.indexOf('#[tauri::command]',lib.indexOf('async fn rpc(')));
  assert.ok(rpc.length>0,'rpc() helper must exist in the compiled crate');
  // Status is captured before the body is consumed, since text() takes self.
  assert.match(rpc,/let status = res\.status\(\);/);
  assert.match(rpc,/if !status\.is_success\(\)/);
  // The body is read and parsed rather than discarded.
  assert.match(rpc,/let body = res\.text\(\)\.await\.unwrap_or_default\(\);/);
  assert.match(rpc,/serde_json::from_str::<Value>\(&body\)/);
  // Both PostgREST error field names are honoured, message first.
  assert.match(rpc,/\.get\("message"\)/);
  assert.match(rpc,/\.get\("error"\)/);
  // An empty body still yields a defined operator message.
  assert.match(rpc,/No server error details returned/);
  // The status and the bounded detail both reach the returned error.
  assert.match(rpc,/Server rejected request \(\{status\}\): \{\}; local data retained/);
  assert.match(rpc,/bounded_detail\(&detail\)/);
  // The status-only handler must be gone.
  assert.ok(!rpc.includes('"Server rejected request ({}); local data retained"'),'status-only rejection message must not remain');
});
test('server error detail is bounded before it is stored as local evidence',()=>{
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  assert.match(lib,/const MAX_SERVER_ERROR_DETAIL: usize = 400;/);
  assert.match(lib,/fn bounded_detail\(detail: &str\) -> String/);
  // Truncation must respect UTF-8 character boundaries.
  assert.match(lib,/while end > 0 && !detail\.is_char_boundary\(end\)/);
  // The rejection string is persisted with local evidence, so it must stay bounded.
  const tests=readFileSync('src-tauri/src/tests.rs','utf8');
  assert.match(tests,/server_error_detail_is_preserved_and_bounded/);
  assert.match(tests,/use super::\{bounded_detail, MAX_SERVER_ERROR_DETAIL\};/);
});
test('the duplicate frontend-tree copy of the native runtime stays in sync',()=>{
  // src/lib.rs is a mirror of src-tauri/src/lib.rs that Cargo does not compile.
  // It must not silently drift back to the status-only error handler.
  const mirror=readFileSync('src/lib.rs','utf8');
  assert.ok(!mirror.includes('"Server rejected request ({}); local data retained"'),'mirror copy must not retain the status-only handler');
  assert.match(mirror,/let body = res\.text\(\)\.await\.unwrap_or_default\(\);/);
  assert.match(mirror,/bounded_detail\(&detail\)/);
});
test('the legacy cloud RPC client still authenticates by device credential',()=>{
  // Guard the authority model: the legacy path must not gain a bearer
  // requirement. Terminal identity is device_token plus the apikey header;
  // v2 identity has no native pairing path yet.
  const lib=readFileSync('src-tauri/src/lib.rs','utf8');
  const rpc=lib.slice(lib.indexOf('async fn rpc('),lib.indexOf('#[tauri::command]',lib.indexOf('async fn rpc(')));
  assert.match(rpc,/\.header\("apikey", key\)/);
  // Any bearer token must remain an explicit, caller-supplied opt-in.
  assert.match(rpc,/if let Some\(token\) = auth \{\s*req = req\.bearer_auth\(token\);/);
  for(const caller of ['"servos_upload"','"servos_poll_requests"','"servos_ack_request"','"servos_reconciliation_manifest"']){
    const call=lib.slice(Math.max(0,lib.indexOf(caller)-400),lib.indexOf(caller));
    assert.match(call,/rpc\(\s*&url,\s*&key,\s*None,/,
      `${caller} must stay on the device-credential path, not an operator bearer token`);
  }
});
