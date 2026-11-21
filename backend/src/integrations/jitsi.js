import { randomBytes } from 'node:crypto';
import { ProviderError } from './providerError.js';

const JITSI_BASE_URL = 'https://meet.jit.si';

export function jitsiConfigurationStatus(env = process.env) {
  const missingKeys = [];
  if (!['development', 'test'].includes(env.NODE_ENV)) missingKeys.push('NODE_ENV=development or test');
  if (env.JITSI_TEST_MODE !== 'true') missingKeys.push('JITSI_TEST_MODE=true');
  return { configured: missingKeys.length === 0, missingKeys };
}

export function createTestJitsiMeeting({
  env = process.env,
  randomBytesImpl = randomBytes,
} = {}) {
  const configuration = jitsiConfigurationStatus(env);
  if (!configuration.configured) {
    throw new ProviderError(
      `Jitsi link creation is disabled. Missing: ${configuration.missingKeys.join(', ')}.`,
      { status: 503 },
    );
  }

  const roomName = `edtech-${randomBytesImpl(24).toString('hex')}`;
  return {
    id: roomName,
    joinUrl: `${JITSI_BASE_URL}/${roomName}`,
  };
}
