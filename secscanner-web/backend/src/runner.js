const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_TIMEOUT_SECONDS = 300;
const DEFAULT_MAX_WORKERS = 32;

function collectCandidatePaths() {
  const candidateFiles = new Set();
  const projectRoot = path.resolve(__dirname, '..', '..');
  const parentDir = path.resolve(projectRoot, '..');
  const grandParentDir = path.resolve(parentDir, '..');
  const baseDirs = [projectRoot, parentDir, grandParentDir];

  const pushCandidates = (basePath) => {
    if (!basePath) return;
    candidateFiles.add(path.resolve(basePath, 'secscanner'));
    candidateFiles.add(path.resolve(basePath, 'secscanner', 'secscanner'));
    candidateFiles.add(path.resolve(basePath, 'secscanner', 'build', 'secscanner'));
    candidateFiles.add(path.resolve(basePath, 'build', 'secscanner'));
  };

  baseDirs.forEach(pushCandidates);

  const inspectDir = (dirPath) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      entries
        .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().includes('secscanner'))
        .forEach((entry) => {
          const base = path.resolve(dirPath, entry.name);
          pushCandidates(base);
        });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[secscanner-web] No se pudo inspeccionar', dirPath, error.message);
      }
    }
  };

  inspectDir(parentDir);
  inspectDir(grandParentDir);

  return Array.from(candidateFiles);
}

function resolveBinaryPath() {
  const triedPaths = [];
  let fromEnv = null;

  if (process.env.SCANNER_BIN) {
    const resolved = path.resolve(process.env.SCANNER_BIN);
    triedPaths.push(resolved);
    try {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        return { binaryPath: resolved, triedPaths, envOverride: resolved };
      }
    } catch {
      // seguimos probando candidatos si la ruta no existe o no es archivo
    }
    fromEnv = resolved;
  }

  const candidates = collectCandidatePaths();
  for (const candidate of candidates) {
    triedPaths.push(candidate);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        return { binaryPath: candidate, triedPaths, envOverride: fromEnv };
      }
    } catch {
      // ignoramos rutas inexistentes
    }
  }

  return { binaryPath: null, triedPaths, envOverride: fromEnv };
}

function parsePortLine(line) {
  const openMatch = /\[\+\]\s+Puerto\s+(\d+)\/(tcp|udp)\s*->\s*(\w+)/i.exec(line);
  if (openMatch) {
    return {
      port: Number(openMatch[1]),
      protocol: openMatch[2].toLowerCase(),
      state: openMatch[3].toLowerCase(),
    };
  }
  const closedMatch = /\[-\]\s+Puerto\s+(\d+)\/(tcp|udp)\s*->\s*(.+)/i.exec(line);
  if (closedMatch) {
    return {
      port: Number(closedMatch[1]),
      protocol: closedMatch[2].toLowerCase(),
      state: closedMatch[3].toLowerCase(),
    };
  }
  return null;
}

async function runScan(job, { onProgress }) {
  const { binaryPath, triedPaths, envOverride } = resolveBinaryPath();

  if (process.env.NODE_ENV !== 'production') {
    console.log('[secscanner-web] Resolución de binario:', {
      binaryPath,
      triedPaths,
      envOverride,
    });
  }
  const params = job.params || {};
  const startedAt = new Date();

  const timeoutSeconds =
    typeof params.timeout === 'number' && params.timeout > 0
      ? Math.min(params.timeout, 900)
      : DEFAULT_TIMEOUT_SECONDS;
  const timeoutMs = timeoutSeconds * 1000;

  const maxWorkers =
    typeof params.maxWorkers === 'number' && params.maxWorkers > 0
      ? Math.min(params.maxWorkers, 512)
      : DEFAULT_MAX_WORKERS;

  const args = [
    '-t',
    params.target,
    '-p',
    params.ports,
    '-T',
    String(timeoutMs),
    '-c',
    String(maxWorkers),
    '-v',
  ];

  const spawnOptions = {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
    },
  };

  const portMap = new Map();
  let lastPortKey = null;
  const stdoutLines = [];
  const stderrLines = [];

  return new Promise((resolve, reject) => {
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      const attempted =
        triedPaths && triedPaths.length
          ? `Intentado en: ${triedPaths.join(' | ')}`
          : 'Sin rutas candidatas detectadas.';
      reject(
        new Error(
          `No se encontró el binario secscanner. Ajusta SCANNER_BIN si es necesario. ${attempted}`,
        ),
      );
      return;
    }

    const child = spawn(binaryPath, args, spawnOptions);
    let timedOut = false;

    const progressWrapper = (payload) => {
      if (typeof onProgress === 'function') {
        onProgress(payload);
      }
    };

    const registerLine = (line, stream) => {
      const payload = {
        scan_id: job.id,
        line,
        stream,
        timestamp: new Date().toISOString(),
      };

      const parsed = parsePortLine(line);
      if (parsed) {
        const key = `${parsed.port}/${parsed.protocol}`;
        const existing = portMap.get(key) || { ...parsed };
        existing.state = parsed.state;
        portMap.set(key, existing);
        lastPortKey = key;
        payload.port = { ...existing };
      } else if (/^\s*Banner:\s*(.+)$/i.test(line) && lastPortKey) {
        const bannerMatch = /^\s*Banner:\s*(.+)$/i.exec(line);
        const entry = portMap.get(lastPortKey) || {};
        entry.banner = bannerMatch[1].trim();
        portMap.set(lastPortKey, entry);
        payload.banner = entry.banner;
        payload.port = { ...entry };
      }

      progressWrapper(payload);
    };

    const rlStdout = readline.createInterface({ input: child.stdout });
    rlStdout.on('line', (line) => {
      stdoutLines.push(line);
      registerLine(line, 'stdout');
    });

    const rlStderr = readline.createInterface({ input: child.stderr });
    rlStderr.on('line', (line) => {
      stderrLines.push(line);
      registerLine(line, 'stderr');
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs + 5000);

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      rlStdout.close();
      rlStderr.close();

      const finishedAt = new Date();
      const durationSeconds = (finishedAt.getTime() - startedAt.getTime()) / 1000;

      if (timedOut) {
        const timeoutError = new Error('Secscanner excedió el tiempo máximo permitido.');
        timeoutError.timedOut = true;
        reject(timeoutError);
        return;
      }

      const ports = Array.from(portMap.values()).sort((a, b) => a.port - b.port);

      const result = {
        scan_id: job.id,
        target: params.target,
        requestedPorts: params.ports,
        timeoutSeconds,
        maxWorkers,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationSeconds,
        ports,
        raw: {
          stdout: stdoutLines,
          stderr: stderrLines,
        },
        metadata: {
          binaryPath,
          args,
          exitCode: code,
          signal,
        },
      };

      if (code !== 0) {
        if (ports.length > 0 || stdoutLines.length > 0 || stderrLines.length > 0) {
          result.metadata.abnormalExit = true;
          result.warnings = [
            `secscanner finalizó con código ${code} (signal: ${signal || 'none'}). Revisa los logs por si hay fallos parciales.`,
          ];
          resolve(result);
          return;
        }

        const error = new Error(
          `El proceso secscanner finalizó con código ${code} (signal: ${signal || 'none'}).`,
        );
        error.code = code;
        error.stdout = stdoutLines;
        error.stderr = stderrLines;
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

module.exports = {
  runScan,
};
