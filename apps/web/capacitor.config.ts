import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agent4socials.app',
  appName: 'Agent4Socials',
  webDir: 'out',
  server: {
    url: 'https://agent4socials.com',
    cleartext: false,
  },
};

export default config;
