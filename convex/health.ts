import { query } from "./_generated/server";

export const getBackendStatus = query({
  args: {},
  handler: async () => {
    return {
      status: "initialized",
      backend: "convex",
      timestamp: Date.now(),
    };
  },
});

