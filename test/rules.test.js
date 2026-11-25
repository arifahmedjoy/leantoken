const assert = require('assert');
const { CognitiveShaper } = require('../src/core/rules');
const fs = require('fs');
const path = require('path');

function testRulesContent() {
  const shaper = new CognitiveShaper();
  const rules = shaper.getRules();
  
  assert(rules.includes('Surgical Minimal Diffs (YAGNI)'), 'Must include minimal diff rule');
  assert(rules.includes('High-Density Telegraphic Responses'), 'Must include concise speak rule');
  assert(rules.includes('Evidence-Based Grounding'), 'Must include anti-hallucination rule');
  
  const tokenEst = Math.ceil(rules.length / 3.8);
  assert(tokenEst < 350, `Rules must stay under 350 tokens, got ${tokenEst}`);
  console.log(`  ✓ Cognitive shaper generated: ${tokenEst} tokens (<350 budget)`);
}

function testRulesInit() {
  const shaper = new CognitiveShaper();
  const res = shaper.init({ dryRun: true });
  assert(res.success === true, 'Dry run should succeed');
  assert(res.message.includes('[Dry Run]'), 'Dry run should describe actions');
  console.log(`  ✓ Cognitive shaper dry-run initialization passed`);
}

module.exports = {
  run() {
    console.log('Testing CognitiveShaper:');
    testRulesContent();
    testRulesInit();
  }
};
