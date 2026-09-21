// The app <-> database contract. Run with `npm run test:contract`.
//
// Reads the app's own source, finds every database call (insert, update, upsert, delete, select,
// rpc), and checks each one against the privileges the real schema grants to the API roles. So if
// someone writes a column the database won't allow (which is how "saving interests" once broke),
// or reads a table the public role can't see, this fails before anything ships.

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
const ok = (name, cond, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "ok   " : "FAIL "}${name}${cond ? "" : "  -> " + extra}`);
};

// ---- the real schema, as the API roles see it ----
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8"));

const q = async (sql, params) => (await db.query(sql, params)).rows;
const tables = new Set((await q(`select table_name from information_schema.tables where table_schema='public'`)).map((r) => r.table_name));
const columnsOf = async (t) => new Set((await q(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).map((r) => r.column_name));
const hasCol = async (role, t, col, priv) => (await q(`select has_column_privilege($1, $2, $3, $4) as ok`, [role, `public.${t}`, col, priv]))[0].ok;
const hasTable = async (role, t, priv) => (await q(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${t}`, priv]))[0].ok;
const fnExecutable = async (role, name) =>
  (await q(`select coalesce(bool_or(has_function_privilege($1, p.oid, 'EXECUTE')), false) as ok from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$2`, [role, name]))[0].ok;

// ---- how tables are linked (foreign keys), to check embedded reads like rsvps(profiles(name)) ----
// PostgREST refuses an embed when more than one foreign key links the two tables and the query doesn't
// say which ("Could not embed because more than one relationship was found"). That once took every
// meetup page down the moment rsvps gained a second link to profiles (invited_by).
const foreignKeys = (await q(`
  select c.conname, c.conrelid::regclass::text as src, c.confrelid::regclass::text as dst,
         (select array_agg(a.attname::text) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) as cols
  from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`));

/** "a, b:t!hint(c, u(d))" -> the embedded tables, nested: [{ table, hint, children }] */
function parseEmbeds(select) {
  const items = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= select.length; i++) {
    const ch = select[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === "," && depth === 0) || i === select.length) { items.push(select.slice(start, i).trim()); start = i + 1; }
  }
  const out = [];
  for (const item of items) {
    const m = item.match(/^(?:\w+:)?(\w+)((?:![\w]+)*)\(([\s\S]*)\)$/);
    if (!m || m[1] === "count") continue;
    const hints = m[2].split("!").filter((h) => h && h !== "inner" && h !== "left");
    out.push({ table: m[1], hint: hints[0] ?? null, children: parseEmbeds(m[3]) });
  }
  return out;
}

/** What is wrong with each embed in a select, given the table it is read from. */
function embedProblems(parent, embeds) {
  const problems = [];
  for (const e of embeds) {
    if (tables.has(e.table)) {
      const links = foreignKeys.filter((f) => (f.src === parent && f.dst === e.table) || (f.src === e.table && f.dst === parent));
      const chosen = e.hint ? links.filter((f) => f.conname === e.hint || (f.cols ?? []).includes(e.hint)) : links;
      if (links.length === 0) problems.push(`${parent} and ${e.table} aren't linked, so ${e.table}(...) can't be embedded`);
      else if (e.hint && chosen.length === 0) problems.push(`the hint !${e.hint} in ${parent} -> ${e.table}(...) matches no link between them`);
      else if (chosen.length > 1) problems.push(`${parent} -> ${e.table}(...) is ambiguous (${links.map((f) => f.conname).join(", ")}): name one, like ${e.table}!${links[0].conname}(...)`);
      problems.push(...embedProblems(e.table, e.children));
    }
  }
  return problems;
}

// ---- find every database call in a piece of source ----
function analyze(source, fileName) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const ops = [];
  const str = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  const keysOf = (n) => {
    if (!n) return null;
    if (ts.isArrayLiteralExpression(n)) {
      const all = n.elements.map(keysOf);
      return all.some((k) => k === null) ? null : [...new Set(all.flat())];
    }
    // rows.map((x) => ({ ... })): a bulk insert where every row is the same object literal
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "map") {
      const fn = n.arguments[0];
      if (fn && ts.isArrowFunction(fn)) {
        let body = fn.body;
        while (ts.isParenthesizedExpression(body)) body = body.expression;
        if (ts.isObjectLiteralExpression(body)) return keysOf(body);
      }
      return null;
    }
    if (!ts.isObjectLiteralExpression(n)) return null; // not a literal: can't check
    const keys = [];
    for (const p of n.properties) {
      if (ts.isSpreadAssignment(p)) return null;
      if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) keys.push(p.name.getText(sf).replace(/['"]/g, ""));
    }
    return keys;
  };
  // Which database role a call runs as, judged by the client it goes through.
  const roleOf = (client) => {
    const text = client ? client.getText(sf) : "";
    if (text === "admin" || text === "createAdminClient()") return "service_role"; // bypasses the API rules
    if (text === "createPublicClient()") return "anon";
    return "authenticated";
  };
  const line = (n) => `${fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const target = node.expression.expression; // whatever the method is called on
      const fromTable = ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "from" ? str(target.arguments[0]) : null;

      if (["insert", "update", "upsert"].includes(method) && fromTable) {
        ops.push({ kind: method, table: fromTable, columns: keysOf(node.arguments[0]), role: roleOf(target.expression.expression), at: line(node) });
      } else if (method === "delete" && fromTable) {
        ops.push({ kind: "delete", table: fromTable, role: roleOf(target.expression.expression), at: line(node) });
      } else if (method === "select") {
        // .from("t").select("...") or a select chained after insert/update: find the table at the chain's root
        let root = target;
        let table = null;
        let role = "authenticated";
        while (root) {
          if (ts.isCallExpression(root) && ts.isPropertyAccessExpression(root.expression)) {
            if (root.expression.name.text === "from") {
              table = str(root.arguments[0]);
              // Reads through the cookie-less client run as `anon`; everything else as the signed-in user.
              role = roleOf(root.expression.expression);
              break;
            }
            root = root.expression.expression;
          } else if (ts.isPropertyAccessExpression(root)) root = root.expression;
          else break;
        }
        if (table) {
          const cols = str(node.arguments[0]) ?? "*";
          const embeds = [...cols.matchAll(/(?:\w+:)?(\w+)(?:![\w]+)?\(/g)].map((m) => m[1]).filter((n) => n !== "count");
          ops.push({ kind: "select", table, embeds, embedTree: parseEmbeds(cols), role, at: line(node) });
        }
      } else if (method === "rpc") {
        ops.push({ kind: "rpc", name: str(node.arguments[0]), at: line(node) });
      }
    }
    // the app's own save helper: updateOrInsert(supabase, "table", { match }, { values })
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "updateOrInsert") {
      const [, tableArg, matchArg, valuesArg] = node.arguments;
      ops.push({ kind: "save", table: str(tableArg), match: keysOf(matchArg), columns: keysOf(valuesArg), at: line(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { ops, usesPublicClient: source.includes("createPublicClient") };
}

// ---- check one operation against the database ----
async function check(op, role = "authenticated") {
  const problems = [];
  // The server-only admin client bypasses the API's column and row rules, so only check that what
  // it names exists. Everything else is judged against what its role is really granted.
  const need = async (cond, msg) => { if (role !== "service_role" && !(await cond)) problems.push(msg); };

  if (op.kind === "rpc") {
    await need(fnExecutable(role, op.name), `${role} can't run function ${op.name}()`);
    return problems;
  }
  if (!tables.has(op.table)) return [`unknown table ${op.table}`];
  const cols = await columnsOf(op.table);

  if (op.kind === "delete") await need(hasTable(role, op.table, "DELETE"), `${role} can't DELETE from ${op.table}`);

  if (op.kind === "select") {
    await need(hasTable(role, op.table, "SELECT"), `${role} can't SELECT from ${op.table}`);
    for (const e of op.embeds ?? []) if (tables.has(e)) await need(hasTable(role, e, "SELECT"), `${role} can't SELECT embedded ${e}`);
    problems.push(...embedProblems(op.table, op.embedTree ?? []));
  }

  if (["insert", "update", "upsert", "save"].includes(op.kind)) {
    if (op.columns === null) return [`can't tell which columns are written (not a plain object): add them explicitly so this can be checked`];
    const written = [...(op.match ?? []), ...op.columns];
    for (const c of written) if (!cols.has(c)) problems.push(`${op.table}.${c} is not a column`);

    const wantInsert = ["insert", "upsert", "save"].includes(op.kind);
    // Supabase's upsert rewrites EVERY column in the payload, keys included. The app's save helper
    // deliberately doesn't: it updates only `columns` and never the match keys.
    const wantUpdate = op.kind === "update" ? op.columns : op.kind === "upsert" ? written : op.kind === "save" ? op.columns : [];
    if (wantInsert) for (const c of written) if (cols.has(c)) await need(hasCol(role, op.table, c, "INSERT"), `${role} can't INSERT ${op.table}.${c}`);
    for (const c of wantUpdate) if (cols.has(c)) await need(hasCol(role, op.table, c, "UPDATE"), `${role} can't UPDATE ${op.table}.${c}`);
    if (op.kind === "save" || op.kind === "update") await need(hasTable(role, op.table, "SELECT"), `${role} can't SELECT ${op.table} (needed to return the updated row)`);
  }
  return problems;
}

// ---- self-test: prove the checker really catches mistakes ----
{
  const bad = analyze(`
    await supabase.from("user_interests").upsert({ user_id: id, categories: c }, { onConflict: "user_id" });
    await supabase.from("events").update({ cancelled_at: now }).eq("id", id);
    await supabase.from("events").insert({ host_id: u, title: t, spots_taken: 3 });
    await supabase.from("reports").select("id");
    await supabase.rpc("is_event_host", { eid: id });
    await supabase.from("events").update({ nonsense: 1 });
  `, "self-test.ts");
  const results = [];
  for (const op of bad.ops) results.push((await check(op)).length > 0);
  ok("self-test: upsert of a key column is flagged", results[0]);
  ok("self-test: writing cancelled_at is flagged", results[1]);
  ok("self-test: inserting spots_taken is flagged", results[2]);
  ok("self-test: reading a table the role can't see is flagged", results[3]);
  ok("self-test: calling a function the role can't run is flagged", results[4]);
  ok("self-test: a column that doesn't exist is flagged", results[5]);

  const bulk = analyze(`
    await supabase.from("events").insert(dates.map((d) => ({ host_id: u, title: t, starts_at: d, series_id: sid, repeat_every: 7 })));
    await supabase.from("events").insert(dates.map((d) => ({ host_id: u, title: t, starts_at: d, cancelled_at: now })));
    await supabase.from("events").insert(dates.map((d) => build(d)));
  `, "self-test.ts");
  const bulkResults = [];
  for (const op of bulk.ops) bulkResults.push((await check(op)).length);
  ok("self-test: a bulk insert built with .map() is read column by column (allowed columns pass)", bulkResults[0] === 0, JSON.stringify(bulkResults));
  ok("self-test: ...a forbidden column inside a bulk insert is flagged", bulkResults[1] > 0, JSON.stringify(bulkResults));
  ok("self-test: ...and a bulk insert it can't read is refused rather than waved through", bulkResults[2] > 0, JSON.stringify(bulkResults));

  const good = analyze(`
    await supabase.from("rsvps").update({ status: s }).eq("event_id", e).select("user_id");
    await supabase.from("events").select("*, host:profiles!host_id(name), rsvps(status, profiles!rsvps_user_id_fkey(name))");
    await supabase.rpc("cancel_event", { eid: id });
    await updateOrInsert(supabase, "user_interests", { user_id: u }, { categories: c, updated_at: n });
  `, "self-test.ts");
  let clean = true;
  for (const op of good.ops) if ((await check(op)).length) clean = false;
  const embeds = analyze(`
    await supabase.from("events").select("*, rsvps(status, profiles(name))");
    await supabase.from("events").select("*, rsvps(status, profiles!invited_by(name))");
    await supabase.from("events").select("*, rsvps(status, profiles!nonsense(name))");
    await supabase.from("events").select("*, profile_private(birth_date)");
    await supabase.from("events").select("*, host:profiles!host_id(name), rsvps(user_id, profiles!rsvps_user_id_fkey(name))");
  `, "self-test.ts");
  const embedResults = [];
  for (const op of embeds.ops) embedResults.push((await check(op)).join(" | "));
  ok("self-test: an embed with two possible links and no hint is flagged as ambiguous (the bug that broke every meetup page)", /ambiguous/.test(embedResults[0]), embedResults[0]);
  ok("self-test: ...naming the link by column or by constraint fixes it", embedResults[1] === "" && embedResults[4] === "", `${embedResults[1]} / ${embedResults[4]}`);
  ok("self-test: ...a hint that matches nothing is flagged", /matches no link/.test(embedResults[2]), embedResults[2]);
  ok("self-test: ...tables that aren't linked at all can't be embedded", /aren't linked/.test(embedResults[3]), embedResults[3]);
  const pub = analyze(`
    await createPublicClient().from("events").select("title");
    await createPublicClient().from("profile_private").select("*");
  `, "self-test.ts");
  const pubResults = [];
  for (const op of pub.ops) pubResults.push((await check(op, op.role)).length === 0);
  ok("self-test: logged-out reads are judged as the logged-out role", pubResults[0] === true && pubResults[1] === false, JSON.stringify(pubResults));
  ok("self-test: correct usage passes", clean && good.ops.length >= 4, `${good.ops.length} ops`);
}

// ---- the real app ----
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === "node_modules" || d.name === ".next" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(d.name) && !d.name.endsWith(".d.ts") ? [p] : [];
  });
}
const files = ["app", "lib", "components"].flatMap((d) => sourceFiles(path.join(ROOT, d)));
let total = 0;
const byKind = {};
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const { ops, usesPublicClient } = analyze(fs.readFileSync(file, "utf8"), rel);
  for (const op of ops) {
    if (op.kind === "save" && !op.table) continue; // the helper's own internals
    total++;
    byKind[op.kind] = (byKind[op.kind] ?? 0) + 1;
    const role = op.role ?? "authenticated";
    const problems = await check(op, role);
    const what = op.kind === "rpc" ? `rpc ${op.name}` : `${op.kind} ${op.table}${op.columns ? ` (${op.columns.join(", ")})` : ""}`;
    ok(`${op.at}  ${what}`, problems.length === 0, problems.join("; "));
  }
}
ok(`found the app's database calls (${total}: ${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(", ")})`, total > 30, `only ${total}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
