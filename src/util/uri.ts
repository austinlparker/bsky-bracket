export function createAtUri(did: string, collection: string, key: string) {
  return `at://${did}/${collection}/${key}`;
}
