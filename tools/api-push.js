/* 经 GitHub REST API 推送本地提交（代理只放行 api.github.com 时备用）
 * 用法: node tools/api-push.js <owner/repo> <token> [fromRef]
 */
const { execSync } = require('child_process');

const REPO = process.argv[2] || 'haoliying/sanguo-srpg';
const TOKEN = process.argv[3];
const FROM = process.argv[4] || 'HEAD~1';
if (!TOKEN) { console.error('缺 token'); process.exit(1); }

const API = 'https://api.github.com/repos/' + REPO;
const H = {
  'Authorization': 'token ' + TOKEN,
  'Accept': 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'api-push'
};

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method, headers: H,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + url + ' -> ' + res.status + ': ' + text.slice(0, 400));
  return JSON.parse(text || '{}');
}

(async () => {
  // 1. 远端 main 当前指向
  const ref = await api('GET', '/git/ref/heads/main');
  const baseCommit = ref.object.sha;
  console.log('远端 main =', baseCommit);

  // 2. 本地提交相对 FROM 的变更清单
  const out = execSync(`git diff --name-status ${FROM} HEAD`, { encoding: 'utf8' });
  const changes = out.trim().split('\n').map(l => {
    const [st, ...p] = l.split('\t');
    return { status: st[0], path: p.join('\t') };
  });
  console.log('变更文件数 =', changes.length);

  // 3. 变更文件逐一上传为 blob
  const entries = [];
  for (const c of changes) {
    if (c.status === 'D') {
      entries.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
      console.log('  删除', c.path);
      continue;
    }
    const buf = require('fs').readFileSync(c.path);
    const blob = await api('POST', '/git/blobs', {
      content: buf.toString('base64'), encoding: 'base64'
    });
    // shell 脚本带执行位
    const mode = c.path.endsWith('.sh') ? '100755' : '100644';
    entries.push({ path: c.path, mode, type: 'blob', sha: blob.sha });
    console.log('  上传', c.path, '(' + Math.round(buf.length / 1024) + 'KB)');
  }

  // 4. 以远端树为基底建新树
  const base = await api('GET', '/git/commits/' + baseCommit);
  const tree = await api('POST', '/git/trees', {
    base_tree: base.tree.sha, tree: entries
  });
  console.log('新树 =', tree.sha);

  // 5. 建提交（沿用本地提交信息）并前移 main
  const msg = execSync('git log -1 --pretty=%B HEAD', { encoding: 'utf8' }).trim();
  const commit = await api('POST', '/git/commits', {
    message: msg, tree: tree.sha, parents: [baseCommit]
  });
  await api('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: false });
  console.log('已推送: main ->', commit.sha);
  console.log('https://github.com/' + REPO + '/commit/' + commit.sha);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
