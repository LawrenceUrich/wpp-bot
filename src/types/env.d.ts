declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    PUPPETEER_EXECUTABLE_PATH?: string;
    WWEBJS_USE_REMOTE_CACHE?: string;
    STORE_IP?: string;
    STORE_NAME?: string;
    RUB_USER?: string;
    RUB_PASS?: string;

    // Manager (se usar)
    ADMIN_TOKEN?: string;
    MANAGER_PORT?: string;
    BOT_ENTRY?: string; // ex: "node dist/server.js" ou "npm run start"
  }
}
