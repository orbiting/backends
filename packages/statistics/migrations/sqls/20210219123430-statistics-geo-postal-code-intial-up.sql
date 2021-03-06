CREATE TABLE IF NOT EXISTS "statisticsGeoPostalCode" (
  "countryCode" citext NOT NULL REFERENCES "statisticsGeoCountry" ON UPDATE CASCADE ON DELETE CASCADE,
  "postalCode" text NOT NULL,
  "lat" float,
  "lon" float,
  PRIMARY KEY ("countryCode", "postalCode")
);
