const fs = require('fs');
const path = require('path');

const HOST_REGEX =
  /^(?=.{1,253}$)(?!-)([A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,63}$|^(localhost)$/i;
const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1?\d{1,2})(\.(25[0-5]|2[0-4]\d|1?\d{1,2})){3}$/;
const PORT_LIST_REGEX = /^(?:\d{1,5}(-\d{1,5})?)(?:,(?:\d{1,5}(-\d{1,5})?))*$/;

function isValidHostname(value) {
  if (!value || typeof value !== 'string') return false;
  return HOST_REGEX.test(value.trim());
}

function isValidIPv4(value) {
  if (!value || typeof value !== 'string') return false;
  return IPV4_REGEX.test(value.trim());
}

function validateTarget(value) {
  if (!value || typeof value !== 'string') {
    return { valid: false, message: 'El target es obligatorio.' };
  }
  const trimmed = value.trim();
  if (trimmed.length > 255) {
    return { valid: false, message: 'El target es demasiado largo.' };
  }
  if (!(isValidHostname(trimmed) || isValidIPv4(trimmed))) {
    return {
      valid: false,
      message: 'El target debe ser un hostname o IPv4 válido.',
    };
  }
  if (/[^A-Za-z0-9\.\-:]/.test(trimmed)) {
    return {
      valid: false,
      message: 'El target contiene caracteres no permitidos.',
    };
  }
  return { valid: true, value: trimmed };
}

function validatePortsSpec(value) {
  if (!value || typeof value !== 'string') {
    return { valid: false, message: 'La lista de puertos es obligatoria.' };
  }
  const trimmed = value.trim();
  if (!PORT_LIST_REGEX.test(trimmed)) {
    return {
      valid: false,
      message:
        'Formato de puertos inválido. Usa coma y rangos, ej: "22,80,8000-8100".',
    };
  }
  const segments = trimmed.split(',');
  for (const segment of segments) {
    if (segment.includes('-')) {
      const [start, end] = segment.split('-').map((n) => parseInt(n, 10));
      if (start > end) {
        return {
          valid: false,
          message: `Rango inválido: ${segment}`,
        };
      }
      if (end > 65535) {
        return {
          valid: false,
          message: `Puerto fuera de rango: ${segment}`,
        };
      }
    } else {
      const port = parseInt(segment, 10);
      if (port > 65535) {
        return {
          valid: false,
          message: `Puerto fuera de rango: ${segment}`,
        };
      }
    }
  }
  return { valid: true, value: trimmed };
}

function clampNumber(value, { min, max, defaultValue }) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return defaultValue;
  }
  const clamped = Math.min(Math.max(value, min), max);
  return clamped;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getResultFilePath(dataDir, scanId) {
  return path.resolve(dataDir, `${scanId}.json`);
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

module.exports = {
  HOST_REGEX,
  IPV4_REGEX,
  PORT_LIST_REGEX,
  validateTarget,
  validatePortsSpec,
  clampNumber,
  ensureDirectory,
  getResultFilePath,
  writeJsonFile,
  readJsonFile,
};
