import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";
import { prisma } from "../config/database";

let clientInstance: Client | null = null;

export function getElasticsearchClient(): Client {
  if (!clientInstance) {
    clientInstance = new Client({
      node: env.ELASTICSEARCH_URL,
      maxRetries: 3,
      requestTimeout: 5000,
    });
  }
  return clientInstance;
}

export interface IndexedEmailDocument {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  error: string | null;
}

export interface SearchEmailsParams {
  userId: string;
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  emails: IndexedEmailDocument[];
  total: number;
  page: number;
  pageSize: number;
  unavailable?: boolean;
}

/**
 * Initializes the Elasticsearch index with appropriate mappings if it does not exist.
 */
export async function initSearchIndex(): Promise<boolean> {
  const client = getElasticsearchClient();
  const indexName = env.ELASTICSEARCH_INDEX;

  try {
    const exists = await client.indices.exists({ index: indexName });
    if (!exists) {
      await client.indices.create({
        index: indexName,
        mappings: {
          properties: {
            id: { type: "keyword" },
            userId: { type: "keyword" },
            campaignId: { type: "keyword" },
            senderId: { type: "keyword" },
            senderEmail: {
              type: "keyword",
              fields: {
                text: { type: "text" },
              },
            },
            senderName: { type: "text" },
            recipient: {
              type: "keyword",
              fields: {
                text: { type: "text" },
              },
            },
            subject: { type: "text" },
            body: { type: "text" },
            status: { type: "keyword" },
            scheduledAt: { type: "date" },
            sentAt: { type: "date" },
            createdAt: { type: "date" },
            error: { type: "text" },
          },
        },
      });
      console.log(`[search] Elasticsearch index '${indexName}' created successfully.`);
    }
    return true;
  } catch (err) {
    console.warn(
      `[search] Unable to initialize Elasticsearch index '${indexName}':`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * Health check for Elasticsearch connectivity.
 */
export async function checkElasticsearchHealth(): Promise<boolean> {
  try {
    const client = getElasticsearchClient();
    const ping = await client.ping();
    return ping;
  } catch {
    return false;
  }
}

/**
 * Indexes or updates a single email document in Elasticsearch based on Email.id.
 * PostgreSQL remains the source of truth; any search indexing errors are caught and logged safely.
 */
export async function indexEmail(emailId: string): Promise<boolean> {
  try {
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: {
        campaign: {
          include: {
            sender: true,
          },
        },
      },
    });

    if (!email) {
      return false;
    }

    const doc: IndexedEmailDocument = {
      id: email.id,
      userId: email.campaign.userId,
      campaignId: email.campaign.id,
      senderId: email.campaign.senderId,
      senderEmail: email.campaign.sender.email,
      senderName: email.campaign.sender.name,
      recipient: email.recipient,
      subject: email.campaign.subject,
      body: email.campaign.body,
      status: email.status,
      scheduledAt: email.scheduledAt.toISOString(),
      sentAt: email.sentAt ? email.sentAt.toISOString() : null,
      createdAt: email.createdAt.toISOString(),
      error: email.error,
    };

    const client = getElasticsearchClient();
    await client.index({
      index: env.ELASTICSEARCH_INDEX,
      id: email.id,
      document: doc,
      refresh: "wait_for",
    });

    return true;
  } catch (err) {
    console.error(
      `[search] Failed to index email ${emailId} in Elasticsearch:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/**
 * Search emails in Elasticsearch with strict user isolation.
 * Every query MUST match the authenticated user's ID.
 */
export async function searchEmails(params: SearchEmailsParams): Promise<SearchResult> {
  const { userId, q, status, page = 1, pageSize = 20 } = params;
  const validPage = Math.max(1, page);
  const validPageSize = Math.min(100, Math.max(1, pageSize));
  const from = (validPage - 1) * validPageSize;

  try {
    const client = getElasticsearchClient();

    const must: any[] = [];
    const filter: any[] = [{ term: { userId } }];

    if (status) {
      filter.push({ term: { status } });
    }

    if (q && q.trim()) {
      const searchTerm = q.trim();
      must.push({
        bool: {
          should: [
            { wildcard: { recipient: `*${searchTerm.toLowerCase()}*` } },
            { wildcard: { senderEmail: `*${searchTerm.toLowerCase()}*` } },
            {
              multi_match: {
                query: searchTerm,
                fields: ["recipient^3", "subject^2", "body", "senderEmail^2", "senderName"],
                fuzziness: "AUTO",
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    const searchResponse = await client.search<IndexedEmailDocument>({
      index: env.ELASTICSEARCH_INDEX,
      from,
      size: validPageSize,
      query: {
        bool: {
          must,
          filter,
        },
      },
      sort: [{ createdAt: { order: "desc" } }],
    });

    const hits = searchResponse.hits.hits.map((hit) => hit._source!).filter(Boolean);
    const totalHits =
      typeof searchResponse.hits.total === "number"
        ? searchResponse.hits.total
        : searchResponse.hits.total?.value ?? 0;

    return {
      emails: hits,
      total: totalHits,
      page: validPage,
      pageSize: validPageSize,
    };
  } catch (err) {
    console.warn(
      `[search] Elasticsearch query failed for user ${userId}:`,
      err instanceof Error ? err.message : String(err),
    );

    return {
      emails: [],
      total: 0,
      page: validPage,
      pageSize: validPageSize,
      unavailable: true,
    };
  }
}
