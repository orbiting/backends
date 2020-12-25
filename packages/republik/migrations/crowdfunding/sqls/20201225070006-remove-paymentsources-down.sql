CREATE TABLE "paymentSources" (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  method "paymentMethod" NOT NULL,
  "userId" uuid REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "pspId" character varying,
  "pspPayload" jsonb,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "companyId" uuid NOT NULL REFERENCES companies(id)
);

CREATE INDEX "paymentSources_userId_idx" ON "paymentSources"("userId" uuid_ops);
