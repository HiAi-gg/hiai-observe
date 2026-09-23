/**
 * One-shot builder for handwritten-migration snapshots 0002–0005.
 * Does not connect to Postgres and does not rewrite SQL files.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { generateDrizzleJson } from "drizzle-kit/api";
import * as schema from "../src/store/schema.ts";

type Snapshot = {
  id: string;
  prevId: string;
  tables: Record<string, TableSnap>;
  [key: string]: unknown;
};

type TableSnap = {
  name: string;
  columns: Record<string, unknown>;
  indexes: Record<string, unknown>;
  foreignKeys: Record<string, unknown>;
  [key: string]: unknown;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function btreeIndex(name: string, columns: string[], unique = false) {
  return {
    name,
    columns: columns.map((expression) => ({
      expression,
      isExpression: false,
      asc: true,
      nulls: "last",
    })),
    isUnique: unique,
    concurrently: false,
    method: "btree",
    with: {},
  };
}

function writeSnap(idx: string, snap: Snapshot) {
  writeFileSync(`drizzle/meta/${idx}_snapshot.json`, `${JSON.stringify(snap, null, 2)}\n`);
}

const snap0001 = JSON.parse(readFileSync("drizzle/meta/0001_snapshot.json", "utf8")) as Snapshot;

const id0002 = randomUUID();
const id0003 = randomUUID();
const id0004 = randomUUID();
const id0005 = randomUUID();

const snap0002 = clone(snap0001);
snap0002.id = id0002;
snap0002.prevId = snap0001.id;
const logs2 = snap0002.tables["public.logs"];
logs2.columns.project_id = {
  name: "project_id",
  type: "uuid",
  primaryKey: false,
  notNull: false,
};
logs2.indexes.logs_project_timestamp_idx = btreeIndex("logs_project_timestamp_idx", [
  "project_id",
  "timestamp",
]);
logs2.foreignKeys.logs_project_id_projects_id_fk = {
  name: "logs_project_id_projects_id_fk",
  tableFrom: "logs",
  tableTo: "projects",
  columnsFrom: ["project_id"],
  columnsTo: ["id"],
  onDelete: "cascade",
  onUpdate: "no action",
};
writeSnap("0002", snap0002);

function authTable(
  name: string,
  columns: Record<string, unknown>,
  indexes: Record<string, unknown>,
  foreignKeys: Record<string, unknown> = {},
  uniqueConstraints: Record<string, unknown> = {},
): TableSnap {
  return {
    name,
    schema: "",
    columns,
    indexes,
    foreignKeys,
    compositePrimaryKeys: {},
    uniqueConstraints,
    policies: {},
    checkConstraints: {},
    isRLSEnabled: false,
  };
}

function textPk(name = "id") {
  return { name, type: "text", primaryKey: true, notNull: true };
}
function textCol(name: string, notNull = false, extra: Record<string, unknown> = {}) {
  return { name, type: "text", primaryKey: false, notNull, ...extra };
}
function boolCol(name: string, notNull = false, extra: Record<string, unknown> = {}) {
  return { name, type: "boolean", primaryKey: false, notNull, ...extra };
}
function tsCol(name: string, notNull = false, extra: Record<string, unknown> = {}) {
  return { name, type: "timestamp", primaryKey: false, notNull, ...extra };
}

const snap0003 = clone(snap0002);
snap0003.id = id0003;
snap0003.prevId = id0002;
snap0003.tables["public.user"] = authTable(
  "user",
  {
    id: textPk(),
    name: textCol("name", true),
    email: textCol("email", true),
    email_verified: boolCol("email_verified", true, { default: false }),
    image: textCol("image"),
    created_at: tsCol("created_at", true, { default: "now()" }),
    updated_at: tsCol("updated_at", true, { default: "now()" }),
  },
  {},
  {},
  {
    user_email_unique: { name: "user_email_unique", nullsNotDistinct: false, columns: ["email"] },
  },
);
snap0003.tables["public.session"] = authTable(
  "session",
  {
    id: textPk(),
    expires_at: tsCol("expires_at", true),
    token: textCol("token", true),
    created_at: tsCol("created_at", true, { default: "now()" }),
    updated_at: tsCol("updated_at", true, { default: "now()" }),
    ip_address: textCol("ip_address"),
    user_agent: textCol("user_agent"),
    user_id: textCol("user_id", true),
  },
  {
    session_userId_idx: btreeIndex("session_userId_idx", ["user_id"]),
  },
  {
    session_user_id_user_id_fk: {
      name: "session_user_id_user_id_fk",
      tableFrom: "session",
      tableTo: "user",
      columnsFrom: ["user_id"],
      columnsTo: ["id"],
      onDelete: "cascade",
      onUpdate: "no action",
    },
  },
  {
    session_token_unique: {
      name: "session_token_unique",
      nullsNotDistinct: false,
      columns: ["token"],
    },
  },
);
snap0003.tables["public.account"] = authTable(
  "account",
  {
    id: textPk(),
    account_id: textCol("account_id", true),
    provider_id: textCol("provider_id", true),
    user_id: textCol("user_id", true),
    access_token: textCol("access_token"),
    refresh_token: textCol("refresh_token"),
    id_token: textCol("id_token"),
    access_token_expires_at: tsCol("access_token_expires_at"),
    refresh_token_expires_at: tsCol("refresh_token_expires_at"),
    scope: textCol("scope"),
    password: textCol("password"),
    created_at: tsCol("created_at", true, { default: "now()" }),
    updated_at: tsCol("updated_at", true, { default: "now()" }),
  },
  {
    account_userId_idx: btreeIndex("account_userId_idx", ["user_id"]),
  },
  {
    account_user_id_user_id_fk: {
      name: "account_user_id_user_id_fk",
      tableFrom: "account",
      tableTo: "user",
      columnsFrom: ["user_id"],
      columnsTo: ["id"],
      onDelete: "cascade",
      onUpdate: "no action",
    },
  },
);
snap0003.tables["public.verification"] = authTable(
  "verification",
  {
    id: textPk(),
    identifier: textCol("identifier", true),
    value: textCol("value", true),
    expires_at: tsCol("expires_at", true),
    created_at: tsCol("created_at", true, { default: "now()" }),
    updated_at: tsCol("updated_at", true, { default: "now()" }),
  },
  {
    verification_identifier_idx: btreeIndex("verification_identifier_idx", ["identifier"]),
  },
);
writeSnap("0003", snap0003);

const snap0004 = clone(snap0003);
snap0004.id = id0004;
snap0004.prevId = id0003;
snap0004.tables["public.account"].columns.issuer = textCol("issuer");
writeSnap("0004", snap0004);

const generated = generateDrizzleJson(schema, id0004) as Snapshot;
generated.id = id0005;
generated.prevId = id0004;
writeSnap("0005", generated);

console.log(
  JSON.stringify(
    {
      ids: { "0002": id0002, "0003": id0003, "0004": id0004, "0005": id0005 },
      generatedTables: Object.keys(generated.tables).sort(),
    },
    null,
    2,
  ),
);
