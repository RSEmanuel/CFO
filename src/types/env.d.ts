declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    DIRECT_URL?: string;
    SHADOW_DATABASE_URL?: string;
    AWS_REGION?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    COGNITO_USER_POOL_ID: string;
    COGNITO_CLIENT_ID: string;
    COGNITO_CLIENT_SECRET?: string;
    /** "true" omite AWS Cognito en desarrollo. Ignorado si NODE_ENV=production. */
    DEV_AUTH_BYPASS?: string;
    NEXT_PUBLIC_DEV_AUTH_BYPASS?: string;
    NODE_ENV?: "development" | "production" | "test";
    NEXT_PUBLIC_APP_URL?: string;
  }
}
