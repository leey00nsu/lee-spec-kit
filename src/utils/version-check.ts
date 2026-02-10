import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { DEFAULT_LANG, Lang, tr } from './i18n.js';

interface VersionCache {
  lastCheck: number;
  latestVersion: string | null;
}

const CACHE_FILE = path.join(os.homedir(), '.lee-spec-kit-version-cache.json');
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24시간

// 현재 패키지 버전 가져오기
function getCurrentVersion(): string {
  try {
    // dist에서 실행될 때 상대 경로로 package.json 찾기
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = fs.readJsonSync(packageJsonPath);
      return pkg.version;
    }
  } catch {
    // 무시
  }
  return '0.0.0';
}

// 캐시 읽기
function readCache(): VersionCache | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return fs.readJsonSync(CACHE_FILE);
    }
  } catch {
    // 무시
  }
  return null;
}

// 버전 비교 (semver 간단 구현)
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if ((latestParts[i] || 0) > (currentParts[i] || 0)) return true;
    if ((latestParts[i] || 0) < (currentParts[i] || 0)) return false;
  }
  return false;
}

function resolveUpdateNoticeLang(): Lang {
  const envLang = (process.env.LANG || '').toLowerCase();
  if (envLang.includes('ko')) return 'ko';
  return DEFAULT_LANG;
}

function printUpdateNotice(current: string, latest: string, lang: Lang): void {
  console.log();
  console.log(chalk.yellow(tr(lang, 'cli', 'versionCheck.noticeAvailable', { latest, current })));
  console.log(chalk.gray(tr(lang, 'cli', 'versionCheck.updateCommand')));
  console.log();
}

// 백그라운드에서 버전 체크 실행 (detached)
function spawnBackgroundVersionCheck(): void {
  const script = `
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const CACHE_FILE = path.join(os.homedir(), '.lee-spec-kit-version-cache.json');
    
    fetch('https://registry.npmjs.org/lee-spec-kit/latest')
      .then(res => res.json())
      .then(data => {
        const cache = { lastCheck: Date.now(), latestVersion: data.version };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      })
      .catch(() => {});
  `;

  const child = spawn('node', ['-e', script], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

// 새 버전 확인 및 알림
export function checkForUpdates(): void {
  try {
    const lang = resolveUpdateNoticeLang();
    const cache = readCache();
    const now = Date.now();

    // 24시간 내에 이미 체크했으면 캐시 사용
    if (cache && now - cache.lastCheck < CHECK_INTERVAL) {
      if (cache.latestVersion) {
        const currentVersion = getCurrentVersion();
        if (isNewerVersion(currentVersion, cache.latestVersion)) {
          printUpdateNotice(currentVersion, cache.latestVersion, lang);
        }
      }
      return;
    }

    // 백그라운드에서 버전 체크 (메인 프로세스 차단 안 함)
    spawnBackgroundVersionCheck();
  } catch {
    // 오류 무시 - 업데이트 체크 실패해도 CLI는 정상 동작
  }
}
