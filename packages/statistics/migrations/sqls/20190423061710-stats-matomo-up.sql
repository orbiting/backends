CREATE TABLE "statisticsMatomo" (
    "idSite" integer NOT NULL,
    url text NOT NULL,
    period text NOT NULL,
    date date NOT NULL,
    segment text,
    entries integer NOT NULL DEFAULT 0,
    exits integer NOT NULL DEFAULT 0,
    loops integer NOT NULL DEFAULT 0,
    pageviews integer NOT NULL DEFAULT 0,
    "previousPages.referrals" integer NOT NULL DEFAULT 0,
    "direct.referrals" integer NOT NULL DEFAULT 0,
    "direct.visits" integer NOT NULL DEFAULT 0,
    "website.referrals" integer NOT NULL DEFAULT 0,
    "website.visits" integer NOT NULL DEFAULT 0,
    "search.referrals" integer NOT NULL DEFAULT 0,
    "search.visits" integer NOT NULL DEFAULT 0,
    "campaign.referrals" integer NOT NULL DEFAULT 0,
    "campaign.visits" integer NOT NULL DEFAULT 0,
    "campaign.newsletter.referrals" integer NOT NULL DEFAULT 0,
    "social.referrals" integer NOT NULL DEFAULT 0,
    "social.visits" integer NOT NULL DEFAULT 0,
    "social.facebook.referrals" integer NOT NULL DEFAULT 0,
    "social.instagram.referrals" integer NOT NULL DEFAULT 0,
    "social.linkedin.referrals" integer NOT NULL DEFAULT 0,
    "social.twitter.referrals" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
    "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "statisticsMatomo_period_date_idx" ON "statisticsMatomo"(period text_ops,date date_ops);
CREATE INDEX "statisticsMatomo_url_idx" ON "statisticsMatomo"(url text_ops);
CREATE UNIQUE INDEX "statisticsMatomo_idSite_url_period_date_segment_idx" ON "statisticsMatomo"("idSite" int4_ops,url text_ops,period text_ops,date date_ops,segment text_ops);
