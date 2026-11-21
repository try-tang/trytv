/**
 * Windows 沙箱下的 next build 兼容层。
 *
 * 背景：本机沙箱不允许创建匿名管道（child_process ipc），而 Next 的 SWC 编译
 * 依赖 jest-worker 通过 fork() 起子进程。此处的做法是把 fork 换成「普通 spawn
 * 子进程 + 127.0.0.1 TCP 通道」，并给子进程注入同样的 IPC 语义。
 *
 * 用法：node -r ./tools/next-build-shim.js node_modules/next/dist/bin/next build
 */
const cp = require('child_process');
const net = require('net');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ---------- 子进程侧：接管 DSH_IPC_PORT ----------
if (process.env.DSH_IPC_PORT && typeof process.send !== 'function') {
  const sock = net.connect(Number(process.env.DSH_IPC_PORT), '127.0.0.1');
  let buf = '';
  sock.setEncoding('utf8');
  sock.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      process.emit('message', msg);
    }
  });
  sock.on('error', () => {});
  process.send = (msg, handle, cb) => {
    try { sock.write(JSON.stringify(msg) + '\n'); } catch {}
    if (typeof cb === 'function') process.nextTick(() => cb(null));
    return true;
  };
  process.connected = true;
  process.channel = { ref() {}, unref() {} };
  process.disconnect = () => { try { sock.end(); } catch {}; process.connected = false; };
}

// ---------- 父进程侧：fork → spawn + TCP ----------
const origSpawn = cp.spawn;
const origFork = cp.fork;
let seq = 0;

/**
 * 部分环境里 next 会用 `cp.spawn(..., {stdio:[...,'ipc']})` 起 worker；
 * 把 ipc 位从 stdio 里剔除（管道不可用）。
 */
cp.spawn = function patchedSpawn(cmd, args, options) {
  if (options && Array.isArray(options.stdio) && options.stdio.includes('ipc')) {
    options = Object.assign({}, options, { stdio: options.stdio.filter((x) => x !== 'ipc') });
  }
  return origSpawn.call(this, cmd, args, options);
};

/**
 * 拦截 fork：先开一个本地 TCP 服务器，再 spawn 普通子进程并注入端口，
 * 把「行分隔 JSON」当作 IPC 消息转发给 child.emit('message')。
 */
cp.fork = function patchedFork(modulePath, args, options) {
  if (args && !Array.isArray(args)) { options = args; args = []; }
  args = args || [];
  options = options || {};
  const env = Object.assign({}, process.env, options.env || {});

  const server = net.createServer();
  const id = `fork-${process.pid}-${seq++}`;
  const fake = new (require('events').EventEmitter)();
  fake.pid = -1;
  fake.connected = true;

  let sock = null;
  const outbox = [];
  const flush = () => {
    if (!sock) return;
    while (outbox.length) sock.write(JSON.stringify(outbox.shift()) + '\n');
  };

  fake.send = (msg, handle, cb) => {
    if (sock) { try { sock.write(JSON.stringify(msg) + '\n'); } catch {} }
    else outbox.push(msg);
    const done = typeof handle === 'function' ? handle : cb;
    if (typeof done === 'function') process.nextTick(() => done(null));
    return true;
  };
  fake.disconnect = () => { try { sock && sock.end(); } catch {}; fake.connected = false; };
  fake.kill = (sig) => { try { child && child.kill(sig); } catch {} return true; };
  fake.ref = () => fake;
  fake.unref = () => fake;

  server.once('connection', (s) => {
    sock = s;
    let buf = '';
    s.setEncoding('utf8');
    s.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        fake.emit('message', msg);
      }
    });
    s.on('error', () => {});
    flush();
  });

  let child = null;
  server.listen(0, '127.0.0.1', () => {
    env.DSH_IPC_PORT = String(server.address().port);
    const stdio = Array.isArray(options.stdio)
      ? options.stdio.filter((x) => x !== 'ipc')
      : ['inherit', 'inherit', 'inherit'];
    try {
      child = origSpawn(modulePath === '-' ? process.execPath : process.execPath, ['--require', __filename, ...(modulePath === '-' ? [] : [modulePath]), ...args], Object.assign({}, options, { env, stdio }));
    } catch (e) {
      fake.emit('error', e);
      return;
    }
    fake.pid = child.pid;
    child.on('error', (e) => fake.emit('error', e));
    child.on('exit', (code, signal) => {
      fake.connected = false;
      try { server.close(); } catch {}
      fake.emit('exit', code, signal);
      fake.emit('close', code, signal);
    });
    fake.emit('spawn');
  });

  server.on('error', () => {});
  return fake;
};

// 便于排查：写一行日志
if (process.env.DSH_IPC_DEBUG) {
  try { fs.appendFileSync(path.join(process.cwd(), '_shim.log'), `shim active pid=${process.pid} role=${process.env.DSH_IPC_PORT ? 'child' : 'parent'}\n`); } catch {}
}
module.exports = { http };
