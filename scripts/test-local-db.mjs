import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import mysql from 'mysql2/promise';
import { resolveMysqlBin } from './mysql-bin.mjs';

const binary = resolveMysqlBin('mysqld', 'MYSQLD_PATH');
if (!binary) throw new Error('İzole test sunucusu için yerel mysqld bulunamadı. MYSQLD_PATH ayarlanabilir.');
const temporaryRoot = fs.realpathSync(os.tmpdir());
const dataDir = fs.mkdtempSync(path.join(temporaryRoot, 'proerp-mysql-test-'));
const logFile = path.join(dataDir, 'server.log');
let server;
function run(executable, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: 'inherit', windowsHide: true, env });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Test alt işlemi başarısız (${code}).`)));
  });
}
try {
  await run(binary, ['--no-defaults', '--initialize-insecure', `--datadir=${dataDir}`]);
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  server = spawn(binary, ['--no-defaults', `--datadir=${dataDir}`, '--bind-address=127.0.0.1', `--port=${port}`, '--mysqlx=0', `--log-error=${logFile}`], { stdio: 'ignore', windowsHide: true });
  server.on('error', error => console.error(error.message));
  let ready = false;
  // Windows'ta ilk InnoDB hazırlığı yoğun disk kullanımında 30 saniyeyi aşabilir.
  for (let attempt = 0; attempt < 400; attempt++) {
    try {
      const connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', connectTimeout: 1000 });
      await connection.end(); ready = true; break;
    } catch { if (server.exitCode !== null) break; await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  if (!ready) throw new Error('Geçici MySQL başlatılamadı: ' + (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').slice(-3000) : 'log bulunamadı'));
  await run(process.execPath, ['scripts/test-db.mjs', ...process.argv.slice(2)], { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USER: 'root', DB_PASSWORD: '' });
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  const resolved = fs.realpathSync(dataDir);
  if (path.dirname(resolved) === temporaryRoot && path.basename(resolved).startsWith('proerp-mysql-test-') && (!server || server.exitCode !== null)) fs.rmSync(resolved, { recursive: true, force: true });
}
