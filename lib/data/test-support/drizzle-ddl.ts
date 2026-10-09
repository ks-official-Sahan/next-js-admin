import * as schema from "../../db/schema";

/** SQL that creates lib/db/schema.ts in an empty database. */
export async function drizzleDdl(): Promise<string> {
  const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  // Foreign keys last: chat_messages references chat_sessions."sessionId",
  // whose unique index drizzle-kit would otherwise create after the key.
  const foreignKey = (statement: string) => statement.includes("FOREIGN KEY");
  return [...statements.filter((s) => !foreignKey(s)), ...statements.filter(foreignKey)].join(";\n");
}
