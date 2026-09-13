import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type MailpitMessageSummary = {
  ID: string;
  Created: string;
  To: Array<{ Address: string }>;
};

type MailpitListResponse = {
  messages: MailpitMessageSummary[];
};

type MailpitMessage = {
  HTML: string;
  Text: string;
};

type FetchLike = (
  input: string,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const assertLocalMailpitUrl = (mailpitUrl: string) => {
  const parsed = new URL(mailpitUrl);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("Mailpit helper is local-only");
  }
  return parsed.origin;
};

const assertLocalSupabaseUrl = (supabaseUrl: string) => {
  const parsed = new URL(supabaseUrl);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("Supabase Auth helper is local-only");
  }
  return parsed.origin;
};

export const resetLocalAuthUser = async ({
  email,
  id,
}: {
  email: string;
  id: string;
}) => {
  const supabaseUrl = assertLocalSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Local Supabase service-role key is not configured");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = supabase.auth.admin;
  const existing = await admin.getUserById(id);
  if (!existing.error) {
    if (existing.data.user.email !== email) {
      throw new Error("The local E2E developer user ID belongs to another email");
    }
    const reset = await supabase
      .from("workspaces")
      .delete()
      .eq("owner_user_id", id);
    if (reset.error) throw reset.error;
    return;
  } else if (existing.error.status !== 404) {
    throw existing.error;
  }

  const attributes = {
    email,
    email_confirm: true,
    id,
  } as Parameters<typeof admin.createUser>[0] & { id: string };
  const created = await admin.createUser(attributes);
  if (created.error) throw created.error;
};

const extractMagicLink = (message: MailpitMessage) => {
  const htmlMatch = message.HTML.match(/href="([^"]+)"/i);
  const textMatch = message.Text.match(/https?:\/\/[^\s)]+/i);
  const link = htmlMatch?.[1] ?? textMatch?.[0];

  if (!link) {
    throw new Error("Magic link was not found in the local test email");
  }

  return link.replaceAll("&amp;", "&");
};

export const getLatestMagicLink = async (
  recipient: string,
  options: {
    mailpitUrl?: string;
    fetch?: FetchLike;
    createdAfter?: Date;
  } = {},
) => {
  const mailpitOrigin = assertLocalMailpitUrl(
    options.mailpitUrl ??
      process.env.LOCAL_MAILPIT_URL ??
      "http://127.0.0.1:54324",
  );
  const fetcher = options.fetch ?? fetch;
  const listResponse = await fetcher(`${mailpitOrigin}/api/v1/messages`);

  if (!listResponse.ok) {
    throw new Error("Local Mailpit message list could not be read");
  }

  const list = (await listResponse.json()) as MailpitListResponse;
  const latest = list.messages
    .filter((message) =>
      message.To.some(
        ({ Address }) => Address.toLowerCase() === recipient.toLowerCase(),
      ),
    )
    .filter(
      (message) =>
        !options.createdAfter ||
        new Date(message.Created).getTime() >= options.createdAfter.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(right.Created).getTime() - new Date(left.Created).getTime(),
    )[0];

  if (!latest) {
    throw new Error(`No local magic-link email found for ${recipient}`);
  }

  const detailResponse = await fetcher(
    `${mailpitOrigin}/api/v1/message/${latest.ID}`,
  );
  if (!detailResponse.ok) {
    throw new Error("Local Mailpit message could not be read");
  }

  return extractMagicLink((await detailResponse.json()) as MailpitMessage);
};

export const requestAndOpenMagicLink = async (
  page: Page,
  recipient: string,
) => {
  // The public sign-in screen is Google-only. Tests authenticate through local
  // Supabase APIs, without re-exposing an email option or depending on Google.
  const supabaseUrl = assertLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!serviceKey || !anonKey) throw new Error("Local test auth is not configured");
  const appUrl = new URL(page.url());
  if (!["localhost", "127.0.0.1"].includes(appUrl.hostname)) throw new Error("Test auth is local-only");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: recipient });
  if (error) throw error;
  const cookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: { getAll: () => [], setAll: (values) => { cookies.push(...values); } },
  });
  const verified = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
  if (verified.error) throw verified.error;
  await page.context().addCookies(cookies.map(({ name, value, options }) => ({
    name, value, domain: appUrl.hostname, path: options.path ?? "/",
    httpOnly: options.httpOnly ?? false, secure: false, sameSite: "Lax" as const,
    ...(options.maxAge ? { expires: Math.floor(Date.now() / 1000) + options.maxAge } : {}),
  })));
  await page.goto(new URL("/app", appUrl.origin).href);
};
