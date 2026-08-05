module.exports = {
  apps: [
    {
      name: "mv-checklist",
      script: "server.mjs",
      // cwd set by `pm2 start` from the app directory
      env: {
        NODE_ENV: "production",
        PORT: "3004",
      },
    },
  ],
};
