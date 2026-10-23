function idString(value) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export function objectIdsEqual(left, right) {
  return Boolean(left && right && idString(left) === idString(right));
}

function applyDocumentSession(query, document) {
  const session = document.$session?.();

  return session ? query.session(session) : query;
}

export async function requireReference({
  document,
  path,
  Model,
  id,
  label,
  select,
}) {
  if (!id) return null;

  let query = Model.findById(id);

  if (select) query = query.select(select);
  query = applyDocumentSession(query, document);

  const referencedDocument = await query.lean();

  if (!referencedDocument) {
    document.invalidate(path, `${label} does not exist.`);
    return null;
  }

  return referencedDocument;
}

export async function requireOrganizationOwnedReference({
  document,
  path,
  Model,
  id,
  organization,
  label,
  select = {},
}) {
  const referencedDocument = await requireReference({
    document,
    path,
    Model,
    id,
    label,
    select: { ...select, organization: 1 },
  });

  if (
    referencedDocument &&
    !objectIdsEqual(referencedDocument.organization, organization)
  ) {
    document.invalidate(
      path,
      `${label} must belong to the same organization.`,
    );
  }

  return referencedDocument;
}
