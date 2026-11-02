import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(readFileSync(resolve(root, "config/platform-settings.json"), "utf8"));

function dollar(value) {
  const text = String(value);
  let tag = "txt";
  while (text.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${text}$${tag}$`;
}

function jsonLiteral(value) {
  return `${dollar(JSON.stringify(value))}::jsonb`;
}

function nullableInt(value) {
  return value == null ? "null" : String(value);
}

const settingKeys = [
  "flags",
  "clients",
  "operations",
  "defaultHours",
  "retention",
  "ai",
  "onboardingChecklist",
  "paymentRecord",
  "externalBlock",
];

const lines = [];
lines.push(`-- Generated from config/platform-settings.json ${source.version}`);
lines.push(`-- Arbitrary platform defaults. PG and Naver API stay off.`);
lines.push(`-- Supabase already provides anon and authenticated, and wraps this file in a transaction.`);
lines.push("");
lines.push(`create table service_categories (
  id text primary key,
  name text not null,
  sort_order integer not null
);`);
lines.push("");
lines.push(`create table menu_templates (
  id text primary key,
  category_id text not null references service_categories (id),
  name text not null,
  price_krw integer not null check (price_krw >= 0),
  duration_min integer not null check (duration_min > 0),
  revisit_cycle_days integer check (revisit_cycle_days is null or revisit_cycle_days > 0),
  sort_order integer not null
);`);
lines.push("");
lines.push(`create table record_field_templates (
  id text primary key,
  category_id text not null references service_categories (id),
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('photo', 'text', 'long_text')),
  required boolean not null,
  shareable boolean not null,
  default_shared boolean not null,
  ai_input boolean not null,
  sort_order integer not null,
  unique (category_id, field_key)
);`);
lines.push("");
lines.push(`create table pre_question_templates (
  id text primary key,
  category_id text not null references service_categories (id),
  prompt text not null,
  sensitive boolean not null,
  required boolean not null,
  ai_input boolean not null,
  sort_order integer not null
);`);
lines.push("");
lines.push(`create table message_templates (
  code text primary key,
  channel text not null check (channel in ('alimtalk', 'push')),
  audience text not null check (audience in ('customer', 'staff')),
  name text not null,
  counts_toward_cap boolean not null,
  variables jsonb not null,
  body text not null,
  buttons jsonb not null
);`);
lines.push("");
lines.push(`create table notification_rules (
  id text primary key,
  menu_template_id text not null references menu_templates (id),
  schedule_type text not null check (schedule_type in ('offset_days', 'before_cycle')),
  days integer not null check (days >= 0),
  send_local_time time not null,
  template_code text not null references message_templates (code),
  priority integer not null,
  unique (menu_template_id, schedule_type, days, template_code)
);`);
lines.push("");
lines.push(`create table consent_documents (
  code text primary key,
  title text not null,
  required boolean not null,
  prechecked boolean not null,
  timing text not null check (timing in ('signup', 'store_connect', 'pre_question')),
  version text not null,
  body text not null
);`);
lines.push("");
lines.push(`create table role_permissions (
  role text not null check (role in ('customer', 'assistant', 'staff', 'owner', 'operator')),
  resource text not null,
  action text not null,
  scope text not null check (scope in ('self', 'assigned', 'store', 'platform', 'platform_audited')),
  primary key (role, resource, action)
);`);
lines.push("");
lines.push(`create table app_settings (
  key text primary key,
  value jsonb not null,
  version text not null,
  updated_at timestamptz not null default now()
);`);
lines.push("");

for (const category of source.categories) {
  lines.push(
    `insert into service_categories (id, name, sort_order) values (${dollar(category.id)}, ${dollar(category.name)}, ${category.sortOrder});`,
  );
}
lines.push("");

for (const message of source.messages) {
  lines.push(
    `insert into message_templates (code, channel, audience, name, counts_toward_cap, variables, body, buttons) values (${dollar(message.code)}, ${dollar(message.channel)}, ${dollar(message.audience)}, ${dollar(message.name)}, ${message.countsTowardCap}, ${jsonLiteral(message.variables)}, ${dollar(message.body)}, ${jsonLiteral(message.buttons)});`,
  );
}
lines.push("");

for (const category of source.categories) {
  for (const field of category.recordFields) {
    const id = `${category.id}_${field.key}`;
    lines.push(
      `insert into record_field_templates (id, category_id, field_key, label, field_type, required, shareable, default_shared, ai_input, sort_order) values (${dollar(id)}, ${dollar(category.id)}, ${dollar(field.key)}, ${dollar(field.label)}, ${dollar(field.fieldType)}, ${field.required}, ${field.shareable}, ${field.defaultShared}, ${field.aiInput}, ${field.sortOrder});`,
    );
  }
  for (const question of category.preQuestions) {
    lines.push(
      `insert into pre_question_templates (id, category_id, prompt, sensitive, required, ai_input, sort_order) values (${dollar(question.id)}, ${dollar(category.id)}, ${dollar(question.prompt)}, ${question.sensitive}, ${question.required}, ${question.aiInput}, ${question.sortOrder});`,
    );
  }
  for (const menu of category.menus) {
    lines.push(
      `insert into menu_templates (id, category_id, name, price_krw, duration_min, revisit_cycle_days, sort_order) values (${dollar(menu.id)}, ${dollar(category.id)}, ${dollar(menu.name)}, ${menu.priceKrw}, ${menu.durationMin}, ${nullableInt(menu.revisitCycleDays)}, ${menu.sortOrder});`,
    );
    for (const rule of menu.notifications) {
      const id = `${menu.id}_${rule.templateCode}_${rule.scheduleType}_${rule.days}`;
      lines.push(
        `insert into notification_rules (id, menu_template_id, schedule_type, days, send_local_time, template_code, priority) values (${dollar(id)}, ${dollar(menu.id)}, ${dollar(rule.scheduleType)}, ${rule.days}, '${source.operations.sendLocalTime}', ${dollar(rule.templateCode)}, ${rule.priority});`,
      );
    }
  }
}
lines.push("");

for (const consent of source.consents) {
  lines.push(
    `insert into consent_documents (code, title, required, prechecked, timing, version, body) values (${dollar(consent.code)}, ${dollar(consent.title)}, ${consent.required}, ${consent.prechecked}, ${dollar(consent.timing)}, ${dollar(consent.version)}, ${dollar(consent.body)});`,
  );
}
lines.push("");

for (const permission of source.permissions) {
  lines.push(
    `insert into role_permissions (role, resource, action, scope) values (${dollar(permission.role)}, ${dollar(permission.resource)}, ${dollar(permission.action)}, ${dollar(permission.scope)});`,
  );
}
lines.push("");

for (const key of settingKeys) {
  const column = key === "defaultHours" ? "default_hours" : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  lines.push(
    `insert into app_settings (key, value, version) values (${dollar(column)}, ${jsonLiteral(source[key])}, ${dollar(source.version)});`,
  );
}
lines.push("");

const catalogTables = [
  "service_categories",
  "menu_templates",
  "record_field_templates",
  "pre_question_templates",
  "message_templates",
  "notification_rules",
  "role_permissions",
  "app_settings",
];

lines.push("alter table consent_documents enable row level security;");
lines.push(`create policy consent_documents_read on consent_documents for select to anon, authenticated using (true);`);
for (const table of catalogTables) {
  lines.push(`alter table ${table} enable row level security;`);
  lines.push(`create policy ${table}_read on ${table} for select to authenticated using (true);`);
}
lines.push("");
lines.push("grant usage on schema public to anon, authenticated;");
lines.push("grant select on consent_documents to anon, authenticated;");
lines.push(`grant select on ${catalogTables.join(", ")} to authenticated;`);
lines.push("");
lines.push("");

const outDir = resolve(root, "supabase/migrations");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "20261102120000_platform_settings.sql");
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`wrote ${outPath}`);
console.log(
  JSON.stringify({
    categories: source.categories.length,
    menus: source.categories.reduce((sum, category) => sum + category.menus.length, 0),
    rules: source.categories.reduce(
      (sum, category) => sum + category.menus.reduce((inner, menu) => inner + menu.notifications.length, 0),
      0,
    ),
    messages: source.messages.length,
    consents: source.consents.length,
    permissions: source.permissions.length,
  }),
);
