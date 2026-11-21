import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSelectedMeeting,
  meetingProviderConfigurationStatus,
  selectedMeetingProviderId,
} from './provider.js';

const jitsiEnv = {
  NODE_ENV: 'development',
  MEETING_PROVIDER: 'jitsi',
  JITSI_TEST_MODE: 'true',
};

test('Jitsi is selected explicitly and is limited to enabled development/test mode', () => {
  assert.equal(selectedMeetingProviderId({}), 'google_meet');
  assert.equal(meetingProviderConfigurationStatus({ env: jitsiEnv }).configured, true);
  assert.equal(
    meetingProviderConfigurationStatus({ env: { ...jitsiEnv, NODE_ENV: 'production' } }).configured,
    false,
  );
  assert.equal(
    meetingProviderConfigurationStatus({ env: { ...jitsiEnv, JITSI_TEST_MODE: 'false' } }).configured,
    false,
  );
});

test('Jitsi links use unique random public rooms without calling a provider API', async () => {
  let seed = 1;
  const randomBytesImpl = (size) => Buffer.alloc(size, seed++);
  let fetchCount = 0;
  const first = await createSelectedMeeting({
    env: jitsiEnv,
    randomBytesImpl,
    fetchImpl: async () => { fetchCount += 1; },
  });
  const second = await createSelectedMeeting({
    env: jitsiEnv,
    randomBytesImpl,
    fetchImpl: async () => { fetchCount += 1; },
  });

  assert.equal(first.provider, 'jitsi');
  assert.match(first.joinUrl, /^https:\/\/meet\.jit\.si\/edtech-[a-f0-9]{48}$/);
  assert.notEqual(first.joinUrl, second.joinUrl);
  assert.equal(fetchCount, 0);
});
