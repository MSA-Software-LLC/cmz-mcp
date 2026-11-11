import { z } from "zod";
import { CMZClient, defaultClient } from "../client.js";
import { clearStoredTokens, loadStoredTokens } from "../auth/store.js";

export const cmzAuthorizeSchema = {
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to force re-authorization even if a token is already stored"),
};

export async function cmzAuthorizeHandler(
  args: z.infer<z.ZodObject<typeof cmzAuthorizeSchema>>,
  client: CMZClient = defaultClient
) {
  if (!args.force) {
    const existing = await loadStoredTokens();
    if (existing && existing.accessToken) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "already_authorized",
                message: "A valid ConnectMasjid authorization token is already stored locally.",
                expiresIn: existing.expiresIn,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  const token = await client.authorizeInteractive();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            status: "success",
            message: "Successfully authorized with ConnectMasjid via browser OAuth. Credentials saved.",
            tokenPreview: token.slice(0, 15) + "...",
          },
          null,
          2
        ),
      },
    ],
  };
}

export const cmzLogoutSchema = {};

export async function cmzLogoutHandler(
  _args: z.infer<z.ZodObject<typeof cmzLogoutSchema>>,
  _client: CMZClient = defaultClient
) {
  await clearStoredTokens();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            status: "success",
            message: "Logged out from ConnectMasjid. Stored credentials cleared.",
          },
          null,
          2
        ),
      },
    ],
  };
}
