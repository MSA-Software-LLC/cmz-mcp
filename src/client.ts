import dotenv from "dotenv";

// Load environment variables from .env if present
dotenv.config();

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
}

export const COMMUNITY_PACKAGE_ID = "cmz_community";

export interface EntityEntitlements {
  packages: string[];
  features: Array<{
    key: string;
    granted: boolean;
    requiredPackage?: string;
  }>;
}

const ENTITY_ENTITLEMENTS_QUERY = `
  query CheckEntityEntitlements($entityId: String!, $entityType: String!) {
    entityEntitlements(entityId: $entityId, entityType: $entityType) {
      packages
      features {
        key
        granted
        requiredPackage
      }
    }
  }
`;

export class CMZClient {
  private baseUrl: string;
  private defaultToken?: string;

  constructor(baseUrl?: string, defaultToken?: string) {
    this.baseUrl = (baseUrl || process.env.CMZ_BACKEND_URL || "http://localhost:8080").replace(/\/+$/, "");
    this.defaultToken = defaultToken || process.env.CMZ_AUTH_TOKEN;
  }

  /**
   * Returns the GraphQL endpoint URL
   */
  private getGraphQLEndpoint(): string {
    if (this.baseUrl.endsWith("/graphql")) {
      return this.baseUrl;
    }
    return `${this.baseUrl}/graphql`;
  }

  /**
   * Executes a GraphQL query or mutation against cmz-backend.
   */
  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
    authTokenOverride?: string
  ): Promise<T> {
    const token = authTokenOverride || this.defaultToken;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };

    if (token) {
      headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }

    const endpoint = this.getGraphQLEndpoint();

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to connect to CMZ GraphQL backend at ${endpoint}: ${msg}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GraphQL request failed with HTTP ${response.status}: ${text}`);
    }

    const result = (await response.json()) as GraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      const messages = result.errors.map((e) => e.message).join("; ");
      throw new Error(`CMZ GraphQL error: ${messages}`);
    }

    if (!result.data) {
      throw new Error("CMZ GraphQL response had no data and no error details.");
    }

    return result.data;
  }

  /**
   * Executes a REST API request against cmz-backend.
   */
  async rest<T>(
    path: string,
    init?: RequestInit,
    authTokenOverride?: string
  ): Promise<T> {
    const token = authTokenOverride || this.defaultToken;
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = new Headers(init?.headers || {});
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", token.startsWith("Bearer ") ? token : `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to connect to CMZ REST endpoint at ${url}: ${msg}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`REST request to ${path} failed with HTTP ${response.status}: ${text}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }

  /**
   * Verifies that the target entity has an active Community Package (`cmz_community`) subscription.
   * Throws a SUBSCRIPTION_REQUIRED error if the entity is only on the free core tier or lacks `cmz_community`.
   */
  async requireCommunityPackage(
    entityId: string,
    entityType: string = "MASJID",
    authTokenOverride?: string
  ): Promise<EntityEntitlements> {
    if (!entityId || entityId.trim() === "") {
      throw new Error("entityId (masjidId) is required to verify Community Package subscription.");
    }

    const data = await this.graphql<{ entityEntitlements: EntityEntitlements }>(
      ENTITY_ENTITLEMENTS_QUERY,
      {
        entityId,
        entityType: entityType.toUpperCase(),
      },
      authTokenOverride
    );

    const entitlements = data.entityEntitlements;
    const activePackages = entitlements?.packages || [];

    if (!activePackages.includes(COMMUNITY_PACKAGE_ID)) {
      throw new Error(
        `SUBSCRIPTION_REQUIRED: MCP access is restricted to paid users with an active CMZ Community Package (${COMMUNITY_PACKAGE_ID}). ` +
          `Entity '${entityId}' currently has packages: [${activePackages.join(", ") || "none"}]. Please upgrade to the Community Package to use MCP tools.`
      );
    }

    return entitlements;
  }
}

export const defaultClient = new CMZClient();
