
Copied
Copy

// src/types/hapi.d.ts
// Extend Hapi's request.app object with our custom properties

import '@hapi/hapi';

declare module '@hapi/hapi' {
  interface RequestApplicationState {
    startTime?: number;
  }
}