CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "referer_pledges" (
  time                    timestamptz NOT NULL,
  "refererName"           text NOT NULL,
  "refererIsCampaign"     boolean NOT NULL DEFAULT false,
  total                   int NOT NULL,
  "pkgName"               text NOT NULL
);

SELECT create_hypertable('referer_pledges', 'time', chunk_time_interval => interval '1 week');


CREATE TABLE "referers" (
  time                    timestamptz NOT NULL,
  "refererName"           text NOT NULL,
  "refererIsCampaign"     boolean NOT NULL DEFAULT false
  --"visitorId"             bytea NOT NULL
);

SELECT create_hypertable('referers', 'time', chunk_time_interval => interval '1 week');





--CREATE TABLE ts.pledges (
--  id        uuid NOT NULL UNIQUE,
--  time      timestamptz NOT NULL,
--);
--
--
--SELECT ts.create_hypertable('ts.pledges', 'time', chunk_time_interval => interval '1 week');
--"pledgeId"     uuid NOT NULL references ts.pledges(id) ON UPDATE CASCADE ON DELETE CASCADE


--CREATE TABLE ts.visitors (
--  id        bytea PRIMARY KEY NOT NULL
--);
