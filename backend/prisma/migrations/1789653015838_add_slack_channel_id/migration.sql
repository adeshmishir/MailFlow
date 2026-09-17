-- Slack rate-limit alerts need a target for chat.postMessage. store the
-- connecting Slack user id so the bot can deliver alerts as a direct message.
ALTER TABLE "SlackConnection" ADD COLUMN "channelId" TEXT;