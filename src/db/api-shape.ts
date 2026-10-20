// The frontend still reads Appwrite-style fields ($id, $createdAt, { documents, total }).
// Until the frontend is renamed (Phase 8), rows are reshaped here on the way out.

type Row = { id: string; createdAt: Date; updatedAt: Date };

export const toApi = <T extends Row>({
  id,
  createdAt,
  updatedAt,
  ...rest
}: T) => ({
  ...rest,
  $id: id,
  $createdAt: createdAt.toISOString(),
  $updatedAt: updatedAt.toISOString(),
});

export const toApiList = <T extends Row>(rows: T[]) => ({
  documents: rows.map(toApi),
  total: rows.length,
});

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ids come from URLs and request bodies; Postgres rejects a malformed uuid with an
// error, so check first and treat a malformed id like one that doesn't exist
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);
