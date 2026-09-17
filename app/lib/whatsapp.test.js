import { describe, test, expect } from "vitest";
import { extractWebhookMessages, extractWebhookMessage } from "./whatsapp.server";

/**
 * Builds a webhook payload shaped like Meta's.
 * @param {Array<Array<Array<object>>>} entries entry → changes → messages
 */
const payload = (entries) => ({
  object: "whatsapp_business_account",
  entry: entries.map((changes) => ({
    id: "waba_1",
    changes: changes.map((messages) => ({
      field: "messages",
      value: { messaging_product: "whatsapp", messages },
    })),
  })),
});

const textMessage = (from, body = "hello") => ({
  from,
  id: `wamid.${from}`,
  type: "text",
  text: { body },
});

describe("extractWebhookMessages", () => {
  test("extracts a single message", () => {
    const result = extractWebhookMessages(payload([[[textMessage("923001234567")]]]));
    expect(result).toEqual([
      { senderPhone: "+923001234567", messageText: "hello" },
    ]);
  });

  // The PRV-4 batching bug: only entry[0].changes[0].messages[0] was read, so
  // everyone else in a batched delivery was silently dropped — their
  // verification simply never happened, with nothing logged.
  test("extracts every message in a batch", () => {
    const result = extractWebhookMessages(
      payload([[[textMessage("923001111111"), textMessage("923002222222")]]])
    );
    expect(result.map((m) => m.senderPhone)).toEqual([
      "+923001111111",
      "+923002222222",
    ]);
  });

  test("walks multiple entries and changes", () => {
    const result = extractWebhookMessages(
      payload([
        [[textMessage("923001111111")], [textMessage("923002222222")]],
        [[textMessage("923003333333")]],
      ])
    );
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.senderPhone)).toEqual([
      "+923001111111",
      "+923002222222",
      "+923003333333",
    ]);
  });

  test("skips non-text messages but keeps text ones alongside", () => {
    const result = extractWebhookMessages(
      payload([
        [
          [
            { from: "923001111111", type: "image", image: { id: "x" } },
            textMessage("923002222222"),
          ],
        ],
      ])
    );
    expect(result).toEqual([
      { senderPhone: "+923002222222", messageText: "hello" },
    ]);
  });

  test("skips messages with no sender", () => {
    const result = extractWebhookMessages(
      payload([[[{ type: "text", text: { body: "hi" } }]]])
    );
    expect(result).toEqual([]);
  });

  test("a status-only callback yields nothing", () => {
    const result = extractWebhookMessages({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }],
    });
    expect(result).toEqual([]);
  });

  test("malformed payloads return an empty array rather than throwing", () => {
    for (const bad of [null, undefined, {}, { entry: null }, { entry: [{}] }, "nope"]) {
      expect(extractWebhookMessages(bad)).toEqual([]);
    }
  });

  test("a missing text body becomes an empty string", () => {
    const result = extractWebhookMessages(
      payload([[[{ from: "923001234567", type: "text" }]]])
    );
    expect(result[0].messageText).toBe("");
  });
});

describe("extractWebhookMessage (single, kept for existing callers)", () => {
  test("returns the first message", () => {
    const result = extractWebhookMessage(
      payload([[[textMessage("923001111111"), textMessage("923002222222")]]])
    );
    expect(result.senderPhone).toBe("+923001111111");
  });

  test("returns null when there is nothing to extract", () => {
    expect(extractWebhookMessage(payload([[[]]]))).toBeNull();
    expect(extractWebhookMessage(null)).toBeNull();
  });
});
