import {
  createGoogleMeetSpace,
  createTestGoogleMeetSpace,
  googleMeetConfigurationStatus,
} from '../integrations/googleMeet.js';
import { createTestJitsiMeeting, jitsiConfigurationStatus } from '../integrations/jitsi.js';
import { ProviderError } from '../integrations/providerError.js';

const DEFAULT_MEETING_PROVIDER = 'google_meet';

export function selectedMeetingProviderId(env = process.env) {
  const configured = typeof env.MEETING_PROVIDER === 'string' ? env.MEETING_PROVIDER.trim().toLowerCase() : '';
  return configured || DEFAULT_MEETING_PROVIDER;
}

export function meetingProviderConfigurationStatus({
  env = process.env,
  testModeOnly = false,
} = {}) {
  const id = selectedMeetingProviderId(env);
  if (id === 'jitsi') {
    return {
      id,
      title: 'Jitsi Meet',
      ...jitsiConfigurationStatus(env),
    };
  }

  if (id === 'google_meet') {
    const missingKeys = [...googleMeetConfigurationStatus(env).missingKeys];
    if (testModeOnly || env.NODE_ENV !== 'production') {
      if (env.GOOGLE_MEET_TEST_MODE !== 'true') missingKeys.push('GOOGLE_MEET_TEST_MODE=true');
      if (!['development', 'test'].includes(env.NODE_ENV)) {
        missingKeys.push('NODE_ENV=development or test');
      }
    }
    return {
      id,
      title: 'Google Meet',
      configured: missingKeys.length === 0,
      missingKeys,
    };
  }

  return {
    id,
    title: 'Meeting provider',
    configured: false,
    missingKeys: ['MEETING_PROVIDER must be google_meet or jitsi'],
  };
}

export async function createSelectedMeeting({
  env = process.env,
  fetchImpl = fetch,
  randomBytesImpl,
  testModeOnly = false,
} = {}) {
  const configuration = meetingProviderConfigurationStatus({ env, testModeOnly });
  if (!configuration.configured) {
    throw new ProviderError(
      `${configuration.title} is not configured. Missing: ${configuration.missingKeys.join(', ')}.`,
      { status: 503 },
    );
  }

  if (configuration.id === 'jitsi') {
    return {
      provider: configuration.id,
      ...createTestJitsiMeeting({ env, randomBytesImpl }),
    };
  }

  const useTestConfiguration = testModeOnly || env.NODE_ENV !== 'production';
  const meeting = useTestConfiguration
    ? await createTestGoogleMeetSpace({ env, fetchImpl })
    : await createGoogleMeetSpace({ env, fetchImpl });
  return { provider: configuration.id, ...meeting };
}
