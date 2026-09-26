export const parseAllowedOrigins = (value: string | undefined): ReadonlySet<string> =>
  new Set((value ?? '').split(',').map((origin) => origin.trim()).filter(Boolean));

export const isAllowedOrigin = (
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): origin is string => origin !== null && allowedOrigins.has(origin);
