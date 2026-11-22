'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const detector = require('../src/detector.js');

test('identifies official GitHub [bot] and /apps/ accounts accurately', () => {
  const dependabot = detector.classifyAccount({
    login: 'dependabot[bot]',
    href: '/apps/dependabot',
    avatarSrc: 'https://avatars.githubusercontent.com/in/29110?v=4'
  });
  assert.equal(dependabot.isBot, true);
  assert.equal(dependabot.kind, 'bot');
  assert.equal(dependabot.baseLogin, 'dependabot');

  const copilot = detector.classifyAccount({
    login: 'copilot-swe-agent[bot]',
    href: '/apps/copilot-swe-agent'
  });
  assert.equal(copilot.isBot, true);
  assert.equal(copilot.kind, 'ai-agent');

  const claudeApp = detector.classifyAccount({
    login: 'claude',
    href: '/apps/claude',
    avatarSrc: 'https://avatars.githubusercontent.com/in/123456?v=4'
  });
  assert.equal(claudeApp.isBot, true);
  assert.equal(claudeApp.kind, 'ai-agent');
});

test('identifies known AI coding agents without [bot] suffix', () => {
  for (const login of [
    'devin-ai-integration',
    'cursoragent',
    'coderabbitai',
    'gemini-code-assist',
    'google-labs-jules',
    'chatgpt-codex-connector',
    'factory-droid',
    'sweep-ai'
  ]) {
    const res = detector.classifyAccount({ login });
    assert.equal(res.isBot, true, `${login} should be bot/agent`);
    assert.equal(res.kind, 'ai-agent', `${login} should be ai-agent`);
  }
});

test('avoids false positives on human usernames containing bot substring', () => {
  for (const login of ['abbot', 'talbot', 'roboticist', 'sabotage', 'bottle', 'linus', 'blueberrycongee']) {
    const res = detector.classifyAccount({
      login,
      href: `/${login}`,
      avatarSrc: 'https://avatars.githubusercontent.com/u/12345?v=4'
    });
    assert.equal(res.isBot, false, `${login} should be human`);
    assert.equal(res.kind, 'human');
  }
});

test('matches heuristic patterns cleanly and respects detectHeuristics toggle', () => {
  const customAgent = detector.classifyAccount({ login: 'acme-coding-agent' });
  assert.equal(customAgent.isBot, true);
  assert.equal(customAgent.kind, 'ai-agent');

  const disabled = detector.classifyAccount(
    { login: 'acme-coding-agent' },
    { detectHeuristics: false }
  );
  assert.equal(disabled.isBot, false);
  assert.equal(disabled.kind, 'human');
});

test('respects manual human whitelist and bot blacklist overrides above all signals', () => {
  const whitelisted = detector.classifyAccount(
    { login: 'copilot-swe-agent[bot]', href: '/apps/copilot-swe-agent' },
    { customHumans: ['copilot-swe-agent'] }
  );
  assert.equal(whitelisted.isBot, false);
  assert.equal(whitelisted.overridden, true);
  assert.equal(whitelisted.source, 'override-human');

  const blacklisted = detector.classifyAccount(
    { login: 'internal-deployer', href: '/internal-deployer' },
    { customBots: ['internal-deployer'] }
  );
  assert.equal(blacklisted.isBot, true);
  assert.equal(blacklisted.overridden, true);
  assert.equal(blacklisted.source, 'override-bot');
});

test('supports custom glob and regex patterns', () => {
  const globMatch = detector.classifyAccount(
    { login: 'corp-release-helper' },
    { customPatterns: ['corp-*-helper'] }
  );
  assert.equal(globMatch.isBot, true);
  assert.equal(globMatch.source, 'custom-pattern');

  const regexMatch = detector.classifyAccount(
    { login: 'svc_sync_01' },
    { customPatterns: ['/^svc_.*_\\d+$/i'] }
  );
  assert.equal(regexMatch.isBot, true);
  assert.equal(regexMatch.source, 'custom-pattern');
});

test('counts human + AI co-authored commits as human by default, with configurable policies', () => {
  const defaultCoauthored = detector.classifyAccountGroup([
    { login: 'alice', href: '/alice' },
    { login: 'claude', href: '/apps/claude' }
  ]);
  assert.equal(defaultCoauthored.groupKind, 'human');
  assert.equal(defaultCoauthored.isBot, false);
  assert.equal(defaultCoauthored.isAssisted, true);
  assert.equal(defaultCoauthored.humans.length, 1);
  assert.equal(defaultCoauthored.bots.length, 1);

  const separateAssisted = detector.classifyAccountGroup(
    [
      { login: 'alice', href: '/alice' },
      { login: 'claude', href: '/apps/claude' }
    ],
    { assistedPolicy: 'assisted' }
  );
  assert.equal(separateAssisted.groupKind, 'assisted');
  assert.equal(separateAssisted.isAssisted, true);

  const asBot = detector.classifyAccountGroup(
    [
      { login: 'alice', href: '/alice' },
      { login: 'claude', href: '/apps/claude' }
    ],
    { assistedPolicy: 'bot' }
  );
  assert.equal(asBot.groupKind, 'ai-agent');
  assert.equal(asBot.isBot, true);

  const pureBot = detector.classifyAccountGroup([
    { login: 'dependabot[bot]', href: '/apps/dependabot' }
  ]);
  assert.equal(pureBot.groupKind, 'bot');
  assert.equal(pureBot.isBot, true);
});

test('identifies Devin bot variants, enterprise slugs, and spaced git author names', () => {
  const officialDevin = detector.classifyAccount({
    login: 'devin-ai-integration[bot]',
    href: '/apps/devin-ai-integration',
    avatarSrc: 'https://avatars.githubusercontent.com/in/811515?v=4'
  });
  assert.equal(officialDevin.isBot, true);
  assert.equal(officialDevin.kind, 'ai-agent');
  assert.equal(officialDevin.baseLogin, 'devin-ai-integration');

  const spacedGitAuthor = detector.classifyAccount({ login: 'Devin AI' });
  assert.equal(spacedGitAuthor.isBot, true);
  assert.equal(spacedGitAuthor.kind, 'ai-agent');
  assert.equal(spacedGitAuthor.baseLogin, 'devin-ai');

  const enterpriseDevin = detector.classifyAccount({ login: 'devin-enterprise-acme' });
  assert.equal(enterpriseDevin.isBot, true);
  assert.equal(enterpriseDevin.kind, 'ai-agent');

  const coauthoredDevin = detector.classifyAccountGroup([
    { login: 'alice', href: '/alice' },
    { login: 'devin-ai-integration[bot]', href: '/apps/devin-ai-integration' }
  ]);
  assert.equal(coauthoredDevin.groupKind, 'human');
  assert.equal(coauthoredDevin.isAssisted, true);
});

test('parses compact numbers and extracts logins from hrefs', () => {
  assert.equal(detector.parseCompactNumber('1,234 commits'), 1234);
  assert.equal(detector.parseCompactNumber('2.5k'), 2500);
  assert.equal(detector.extractLoginFromHref('/apps/dependabot'), 'dependabot[bot]');
  assert.equal(detector.extractLoginFromHref('/owner/repo/commits?author=octocat'), 'octocat');
});
