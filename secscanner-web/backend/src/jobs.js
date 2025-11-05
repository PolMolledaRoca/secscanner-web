const { EventEmitter } = require('events');
const crypto = require('crypto');
const path = require('path');
const {
  ensureDirectory,
  getResultFilePath,
  writeJsonFile,
  readJsonFile,
  clampNumber,
} = require('./utils');
const { runScan } = require('./runner');

class JobQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    const { maxParallelJobs = 2, dataDir = path.resolve(__dirname, '..', 'data') } = options;
    this.maxParallelJobs = clampNumber(maxParallelJobs, {
      min: 1,
      max: 8,
      defaultValue: 2,
    });
    this.dataDir = dataDir;
    ensureDirectory(this.dataDir);

    this.jobs = new Map();
    this.queue = [];
    this.activeJobs = 0;
  }

  enqueue(params) {
    const scanId = crypto.randomUUID();
    const now = new Date().toISOString();
    const job = {
      id: scanId,
      status: 'queued',
      params,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      progress: [],
      result: null,
      error: null,
      filePath: getResultFilePath(this.dataDir, scanId),
    };

    this.jobs.set(scanId, job);
    this.queue.push(scanId);
    this._processQueue();
    return job;
  }

  hasJob(scanId) {
    return this.jobs.has(scanId);
  }

  getJob(scanId) {
    return this.jobs.get(scanId) || null;
  }

  serializeJob(job) {
    if (!job) return null;
    const base = {
      scan_id: job.id,
      status: job.status,
      params: job.params,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error,
      resultPath: job.status === 'done' ? job.filePath : null,
    };

    if (job.status === 'done' && job.result) {
      base.result = job.result;
    }
    if (job.progress && job.progress.length) {
      base.progress = job.progress.slice(-20);
    }
    return base;
  }

  _processQueue() {
    if (this.activeJobs >= this.maxParallelJobs) {
      return;
    }
    const nextId = this.queue.shift();
    if (!nextId) {
      return;
    }
    const job = this.jobs.get(nextId);
    if (!job) {
      this._processQueue();
      return;
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.updatedAt = job.startedAt;
    this.activeJobs += 1;

    this.emit('status', { jobId: job.id, job: this.serializeJob(job) });

    const progressHandler = (payload) => {
      job.progress.push(payload);
      if (job.progress.length > 200) {
        job.progress.splice(0, job.progress.length - 200);
      }
      job.updatedAt = new Date().toISOString();
      this.emit('progress', { jobId: job.id, payload });
    };

    runScan(job, { onProgress: progressHandler })
      .then((result) => {
        job.status = 'done';
        job.result = result;
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
        ensureDirectory(this.dataDir);
        writeJsonFile(job.filePath, result);
        this.emit('done', {
          jobId: job.id,
          payload: {
            scan_id: job.id,
            status: job.status,
            result,
            filePath: job.filePath,
          },
        });
      })
      .catch((error) => {
        job.status = 'error';
        job.error = {
          message: error.message || 'Error desconocido.',
          code: error.code || null,
          timedOut: !!error.timedOut,
        };
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
        this.emit('error', { jobId: job.id, error });
      })
      .finally(() => {
        this.activeJobs = Math.max(0, this.activeJobs - 1);
        setImmediate(() => this._processQueue());
      });
  }
}

function createJobQueue(options) {
  return new JobQueue(options);
}

module.exports = {
  JobQueue,
  createJobQueue,
};
