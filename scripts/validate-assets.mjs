#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();

const checks = [
  {
    file: 'assets/icon.png',
    required: true,
    square: true,
    exact: { width: 1024, height: 1024 },
    label: 'App icon'
  },
  {
    file: 'assets/adaptive-icon.png',
    required: true,
    square: true,
    min: { width: 512, height: 512 },
    label: 'Android adaptive icon'
  },
  {
    file: 'assets/splash-icon.png',
    required: true,
    min: { width: 256, height: 256 },
    label: 'Splash image'
  },
  {
    file: 'assets/notification-icon.png',
    required: true,
    square: true,
    min: { width: 64, height: 64 },
    label: 'Notification icon'
  },
  {
    file: 'assets/nura-wordmark-light.png',
    required: true,
    min: { width: 800, height: 300 },
    label: 'Brand wordmark light'
  },
  {
    file: 'assets/nura-wordmark-dark.png',
    required: true,
    min: { width: 800, height: 300 },
    label: 'Brand wordmark dark'
  }
];

const results = [];
let hasError = false;

function fail(message) {
  hasError = true;
  results.push(`ERROR  ${message}`);
}

function ok(message) {
  results.push(`OK     ${message}`);
}

function readPngDimensions(filePath) {
  const absolute = path.join(projectRoot, filePath);
  if (!fs.existsSync(absolute)) {
    return { error: 'missing' };
  }

  const result = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', absolute], {
    encoding: 'utf8'
  });

  if (result.error) {
    return { error: result.error.message };
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    return { error: stderr || 'invalid PNG' };
  }

  const widthMatch = result.stdout.match(/pixelWidth:\s*(\d+)/);
  const heightMatch = result.stdout.match(/pixelHeight:\s*(\d+)/);
  if (!widthMatch || !heightMatch) {
    return { error: 'could not read image dimensions' };
  }

  return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
}

for (const check of checks) {
  const result = readPngDimensions(check.file);

  if ('error' in result) {
    if (result.error === 'missing' && !check.required) {
      ok(`${check.label} (${check.file}) missing but optional`);
      continue;
    }
    fail(`${check.label} (${check.file}) is invalid: ${result.error}`);
    continue;
  }

  const { width, height } = result;
  const fileLabel = `${check.label} (${check.file}) ${width}x${height}`;

  if (check.square && width !== height) {
    fail(`${fileLabel} must be square`);
    continue;
  }

  if (check.exact && (width !== check.exact.width || height !== check.exact.height)) {
    fail(
      `${fileLabel} must be exactly ${check.exact.width}x${check.exact.height}`
    );
    continue;
  }

  if (check.min && (width < check.min.width || height < check.min.height)) {
    fail(
      `${fileLabel} must be at least ${check.min.width}x${check.min.height}`
    );
    continue;
  }

  ok(fileLabel);
}

const light = readPngDimensions('assets/nura-wordmark-light.png');
const dark = readPngDimensions('assets/nura-wordmark-dark.png');
if (!('error' in light) && !('error' in dark)) {
  if (light.width !== dark.width || light.height !== dark.height) {
    fail(
      `Brand wordmarks must have identical dimensions (light ${light.width}x${light.height}, dark ${dark.width}x${dark.height})`
    );
  } else {
    ok(`Brand wordmarks share the same dimensions (${light.width}x${light.height})`);
  }
}

for (const line of results) {
  console.log(line);
}

if (hasError) {
  process.exit(1);
}
