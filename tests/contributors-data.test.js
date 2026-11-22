'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const contributorsData = require('../src/contributors-data.js');
const detector = require('../src/detector.js');

test('parseRepoFromPath parses valid contributor graph paths and rejects others', () => {
  assert.deepEqual(contributorsData.parseRepoFromPath('/longbridge/nsh/graphs/contributors'), {
    owner: 'longbridge',
    repo: 'nsh',
    key: 'longbridge/nsh'
  });
  assert.deepEqual(contributorsData.parseRepoFromPath('/Longbridge/NSH/graphs/contributors/'), {
    owner: 'Longbridge',
    repo: 'NSH',
    key: 'longbridge/nsh'
  });
  assert.equal(contributorsData.parseRepoFromPath('/longbridge/nsh/commits'), null);
});

test('normalizeContributorsPayload sorts ascending GitHub payload into descending commit order', () => {
  const payload = [
    {
      author: {
        id: 10,
        login: 'dependabot[bot]',
        avatar: 'https://avatars.githubusercontent.com/in/29110?v=4',
        path: '/apps/dependabot'
      },
      total: 12,
      weeks: [
        { w: 1700000000, a: 40, d: 10, c: 5 },
        { w: 1700604800, a: 60, d: 20, c: 7 }
      ]
    },
    {
      author: {
        id: 1,
        login: 'huacnlee',
        avatar: 'https://avatars.githubusercontent.com/u/5518?v=4',
        path: '/huacnlee'
      },
      total: 902,
      weeks: [{ w: 1700000000, a: 1111078, d: 258605, c: 902 }]
    },
    {
      author: {
        id: 2,
        login: 'claude',
        avatar: 'https://avatars.githubusercontent.com/in/999?v=4',
        path: '/apps/claude'
      },
      total: 1029,
      weeks: [{ w: 1700000000, a: 1188252, d: 259058, c: 1029 }]
    }
  ];

  const normalized = contributorsData.normalizeContributorsPayload(payload);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].login, 'claude');
  assert.equal(normalized[0].commits, 1029);
  assert.equal(normalized[1].login, 'huacnlee');
  assert.equal(normalized[1].commits, 902);
  assert.equal(normalized[2].login, 'dependabot[bot]');
  assert.equal(normalized[2].additions, 100);
  assert.equal(normalized[2].deletions, 30);
});

test('analyzeContributors separates humans, AI agents, and traditional bots with exact ranks and shares', () => {
  const records = contributorsData.normalizeContributorsPayload([
    {
      author: { login: 'claude', path: '/apps/claude', avatar: 'https://avatars.githubusercontent.com/in/1?v=4' },
      total: 500,
      weeks: [{ w: 1700000000, a: 10000, d: 2000, c: 500 }]
    },
    {
      author: { login: 'huacnlee', path: '/huacnlee', avatar: 'https://avatars.githubusercontent.com/u/1?v=4' },
      total: 400,
      weeks: [{ w: 1700000000, a: 8000, d: 1500, c: 400 }]
    },
    {
      author: { login: 'dependabot[bot]', path: '/apps/dependabot', avatar: 'https://avatars.githubusercontent.com/in/29110?v=4' },
      total: 100,
      weeks: [{ w: 1700000000, a: 500, d: 200, c: 100 }]
    }
  ]);

  const analysis = contributorsData.analyzeContributors(records, {}, detector);

  assert.equal(analysis.counts.total, 3);
  assert.equal(analysis.counts.human, 1);
  assert.equal(analysis.counts.aiAgent, 1);
  assert.equal(analysis.counts.bot, 1);
  assert.equal(analysis.counts.totalBots, 2);

  // Ranks: claude overall #1 (bot #1), huacnlee overall #2 (human #1), dependabot overall #3 (bot #2)
  assert.equal(analysis.byLogin.get('claude').overallRank, 1);
  assert.equal(analysis.byLogin.get('claude').groupRank, 1);
  assert.equal(analysis.byLogin.get('huacnlee').overallRank, 2);
  assert.equal(analysis.byLogin.get('huacnlee').groupRank, 1);
  assert.equal(analysis.byLogin.get('dependabot').overallRank, 3);
  assert.equal(analysis.byLogin.get('dependabot').groupRank, 2);

  // Shares: 40% human, 50% AI agent, 10% bot
  assert.equal(analysis.shares.humanPct, 40);
  assert.equal(analysis.shares.aiAgentPct, 50);
  assert.equal(analysis.shares.botPct, 10);
  assert.equal(analysis.shares.allBotsPct, 60);
});

test('analyzeContributors respects manual overrides dynamically on cached records', () => {
  const records = contributorsData.normalizeContributorsPayload([
    { author: { login: 'claude', path: '/apps/claude' }, total: 300, weeks: [] },
    { author: { login: 'alice', path: '/alice' }, total: 100, weeks: [] }
  ]);

  const overridden = contributorsData.analyzeContributors(
    records,
    { customHumans: ['claude'], customBots: ['alice'] },
    detector
  );

  assert.equal(overridden.counts.human, 1);
  assert.equal(overridden.counts.totalBots, 1);
  assert.equal(overridden.humans[0].login, 'claude');
  assert.equal(overridden.bots[0].login, 'alice');
});

test('aggregateWeeklyBars trims leading zero weeks and buckets long histories cleanly', () => {
  const weeks = [];
  for (let i = 0; i < 120; i++) {
    weeks.push({
      w: 1600000000 + i * 604800,
      a: i < 20 ? 0 : 10,
      d: i < 20 ? 0 : 2,
      c: i < 20 ? 0 : 1
    });
  }

  const bars = contributorsData.aggregateWeeklyBars(weeks, 25);
  assert.ok(bars.length <= 25);
  assert.equal(bars[0].start, 1600000000 + 20 * 604800);
  const totalCommits = bars.reduce((sum, b) => sum + b.commits, 0);
  assert.equal(totalCommits, 100);
});
