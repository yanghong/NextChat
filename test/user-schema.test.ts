import { AUTH_SCHEMA_SQL } from "@/app/lib/server/schema";

describe("user auth schema", () => {
  test("defines the required user and chat tables", () => {
    expect(AUTH_SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(AUTH_SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS auth_sessions");
    expect(AUTH_SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS chat_sessions");
    expect(AUTH_SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS chat_messages");
  });

  test("enforces user isolation indexes", () => {
    expect(AUTH_SCHEMA_SQL).toContain("UNIQUE KEY uniq_users_email");
    expect(AUTH_SCHEMA_SQL).toContain("UNIQUE KEY uniq_auth_sessions_token");
    expect(AUTH_SCHEMA_SQL).toContain("UNIQUE KEY uniq_chat_sessions_user_client");
    expect(AUTH_SCHEMA_SQL).toContain("KEY idx_chat_messages_user_session");
  });
});
