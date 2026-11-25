const assert = require('assert');
const { SessionLearner } = require('../src/core/learner');
const fs = require('fs');
const path = require('path');

function testLearnerOutdatedTranscript() {
  const testMemoryPath = path.join(__dirname, 'temp-MEMORY.md');
  const learner = new SessionLearner({ memoryPath: testMemoryPath });
  
  // Simulate synthetic transcript entries
  const fileReads = {
    'D:/project/src/config.json': 5,
    'D:/project/README.md': 1
  };
  const commandErrors = [
    { cmd: 'git pull origin main', code: 1, error: 'rejected non-fast-forward' }
  ];

  const res = learner.updateMemory(fileReads, commandErrors);
  assert(res.success === true);
  assert(res.hotFilesCount === 1, 'Should find 1 hot file');
  
  const saved = fs.readFileSync(testMemoryPath, 'utf8');
  assert(saved.includes('config.json'), 'Memory must record repeatedly read file');
  assert(saved.includes('git pull'), 'Memory must record failed command');

  // Clean up
  fs.unlinkSync(testMemoryPath);
  console.log(`  ✓ Session learner correctly mined hot files and command traps`);
}

module.exports = {
  run() {
    console.log('Testing SessionLearner:');
    testLearnerOutdatedTranscript();
  }
};
