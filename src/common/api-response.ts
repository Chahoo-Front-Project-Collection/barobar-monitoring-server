export function ok<T>(data: T, message = 'OK') {
  return { success: true, message, data };
}

export function paginated<T>(
  items: T[],
  total: number,
  limit: number,
  message = 'OK',
) {
  return {
    success: true,
    message,
    data: { items, pagination: { total, limit } },
  };
}
