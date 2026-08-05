module.exports = {
  apps: [
    {
      name: "mv-checklist",
      script: "server.mjs",
      cwd: "/var/www/mv-checklist",
      env: {
        NODE_ENV: "production",
        PORT: "3004",
      },
    },
  ],
};
