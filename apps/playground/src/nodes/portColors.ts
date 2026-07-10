export function portTypeColor(type: string): string {
  switch (type) {
    case 'string': return '#22c55e';
    case 'number': return '#3b82f6';
    case 'array': return '#f59e0b';
    case 'object': return '#8b5cf6';
    case 'boolean': return '#ef4444';
    default: return '#6b7280';
  }
}
